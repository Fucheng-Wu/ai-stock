package com.ruoyi.system.service.impl;

import java.io.InputStream;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.system.domain.stock.StockKlineData;
import com.ruoyi.system.service.support.*;

@Service
public class StockMarketService
{
    private static final Logger log = LoggerFactory.getLogger(StockMarketService.class);
    private final StockMarketRepository repository;
    private final StockMarketSource source;
    private final int workers;

    public StockMarketService(StockMarketRepository repository, StockMarketSource source, @Value("${stock.market.workers:4}") int workers)
    {
        if (workers < 1 || workers > 8) throw new IllegalArgumentException("行情工作线程必须为1到8");
        this.repository = repository; this.source = source; this.workers = workers;
    }
    public void syncDaily() throws Exception { sync(LocalDate.now(StockMarketRepository.ZONE)); }
    public void screenDaily() throws Exception
    {
        LocalDate today = LocalDate.now(StockMarketRepository.ZONE);
        if (weekend(today)) { log.info("520筛选跳过周末：{}", today); return; }
        screen(today);
    }
    private static boolean weekend(LocalDate date) { return date.getDayOfWeek() == DayOfWeek.SATURDAY || date.getDayOfWeek() == DayOfWeek.SUNDAY; }
    private static LocalDate day(Object value) { return LocalDate.parse(String.valueOf(value)); }

    public void sync(LocalDate target) throws Exception
    {
        if (target.isAfter(LocalDate.now(StockMarketRepository.ZONE))) throw new ServiceException("不能同步未来行情");
        try (StockMarketRepository.PipelineLock ignored = repository.lock())
        {
            Map<String, Object> latest = repository.latestSync(null);
            if (latest != null && day(latest.get("trade_date")).isAfter(target)) throw new ServiceException("不能用旧日期覆盖较新的复权基准；历史数据请使用迁移程序");
            String run = UUID.randomUUID().toString().replace("-", "");
            repository.beginSync(run, target);
            ExecutorService pool = null;
            try
            {
                if (weekend(target)) { repository.finishSync(run, "SKIPPED", "周末不获取日线"); return; }
                // An unavailable index is not silently called a holiday or replaced with yesterday's bars.
                if (!source.marketReady(target)) throw new ServiceException(target + "指数日线尚未就绪，可能休市或源数据延迟；请核实后补跑");
                List<StockMarketSource.Security> securities = source.universe();
                if (securities.isEmpty()) throw new ServiceException("全市场股票清单为空");
                repository.registerUniverse(run, target, securities);
                pool = Executors.newFixedThreadPool(workers);
                CompletionService<Boolean> completed = new ExecutorCompletionService<>(pool);
                List<Future<Boolean>> tasks = new ArrayList<>();
                for (StockMarketSource.Security security : securities)
                    tasks.add(completed.submit(() -> {
                        try
                        {
                            List<StockMarketSource.Bar> bars = source.history(security.symbol(), target, 300);
                            if (bars.isEmpty()) throw new ServiceException("行情源没有返回日线，不能据此认定停牌");
                            if (Thread.currentThread().isInterrupted()) throw new InterruptedException("任务中断");
                            repository.saveBars(run, target, security, bars);
                            return true;
                        }
                        catch (Exception e)
                        {
                            if (!Thread.currentThread().isInterrupted()) repository.failItem(run, security.symbol(), e.getMessage());
                            log.warn("行情同步失败 {} {}：{}", target, security.symbol(), e.getMessage());
                            return false;
                        }
                    }));
                int failures = 0, consecutive = 0;
                for (int i = 1; i <= securities.size(); i++)
                {
                    boolean success = completed.take().get();
                    if (success) consecutive = 0; else { failures++; consecutive++; }
                    if (i % 100 == 0) log.info("行情同步 {}：{}/{}，失败{}", target, i, securities.size(), failures);
                    if (consecutive >= 8) { tasks.forEach(task -> task.cancel(true)); throw new ServiceException("连续8只股票同步失败，已停止后续请求；请检查行情源并补跑"); }
                }
                if (failures > 0) throw new ServiceException("当日行情有" + failures + "只同步失败，批次不可用于17点筛选；请补跑");
                repository.finishSync(run, "COMPLETE", null);
                log.info("全市场行情同步完成 {}，股票{}只", target, securities.size());
            }
            catch (Exception e)
            {
                if (pool != null)
                {
                    pool.shutdownNow();
                    try { await(pool); }
                    catch (Exception shutdownError) { e.addSuppressed(shutdownError); }
                }
                repository.finishSync(run, "FAILED", e.getMessage());
                throw e;
            }
            finally { if (pool != null) { pool.shutdownNow(); await(pool); } }
        }
    }
    private static void await(ExecutorService pool) throws InterruptedException
    {
        if (!pool.awaitTermination(60, TimeUnit.SECONDS)) throw new IllegalStateException("行情工作线程未结束，请检查超时配置");
    }

    public String screen(LocalDate target) throws Exception
    {
        try (StockMarketRepository.PipelineLock ignored = repository.lock())
        {
            Map<String, Object> sync = repository.latestSync(target), latest = repository.latestSync(null);
            if (sync == null || !"COMPLETE".equals(sync.get("status"))) throw new ServiceException(target + "行情批次尚未完成，拒绝使用昨日数据；请先完成或补跑16点任务");
            if (latest != null && day(latest.get("trade_date")).isAfter(target)) throw new ServiceException("复权数据已更新到更晚日期，请查询已保存的历史筛选结果，不回算旧日期");
            String sourceId = String.valueOf(sync.get("run_id"));
            List<Map<String, Object>> securities = repository.universe(sourceId);
            if (securities.size() != ((Number) sync.get("expected_count")).intValue() || securities.isEmpty()) throw new ServiceException("行情股票清单覆盖数量不一致");
            String snapshot = "mysql-" + target.toString().replace("-", "") + "-" + UUID.randomUUID().toString().replace("-", "");
            repository.beginScreen(snapshot, sourceId, target, engineHash(), securities.size());
            int analyzed = 0, excluded = 0, up = 0, matched = 0, st = 0, golden = 0, retrace = 0, convergence = 0;
            Map<String, Integer> reasons = new TreeMap<>();
            try
            {
                for (Map<String, Object> security : securities)
                {
                    String symbol = String.valueOf(security.get("symbol")), name = String.valueOf(security.get("name")), exchange = String.valueOf(security.get("exchange"));
                    List<Map<String, Object>> data = repository.bars(sourceId, symbol, target);
                    String reason = data.isEmpty() || !target.equals(day(data.get(data.size()-1).get("trade_date"))) ? "STALE_OR_MISSING_DATA"
                        : data.size() < 21 ? "INSUFFICIENT_HISTORY" : ((Number) data.get(data.size()-1).get("volume_shares")).longValue() <= 0 ? "NO_TRADING_VOLUME" : null;
                    Map<String, Object> result;
                    if (reason != null)
                    {
                        result = new LinkedHashMap<>(); result.put("symbol", symbol); result.put("name", name); result.put("exchange", exchange);
                        result.put("isST", name.toUpperCase(Locale.ROOT).matches("^S?\\*?ST.*")); result.put("tradeDate", target.toString());
                        result.put("lastDate", data.isEmpty() ? null : String.valueOf(data.get(data.size()-1).get("trade_date")));
                        result.put("status", "excluded"); result.put("reason", reason); excluded++; reasons.merge(reason, 1, Integer::sum);
                    }
                    else
                    {
                        List<StockKlineData> bars = new ArrayList<>();
                        for (Map<String, Object> row : data)
                        {
                            StockKlineData bar = new StockKlineData(); bar.setDate(String.valueOf(row.get("trade_date")));
                            bar.setOpen(((Number) row.get("qfq_open")).doubleValue()); bar.setHigh(((Number) row.get("qfq_high")).doubleValue());
                            bar.setLow(((Number) row.get("qfq_low")).doubleValue()); bar.setClose(((Number) row.get("qfq_close")).doubleValue()); bar.setVolume(((Number) row.get("volume_shares")).longValue()); bars.add(bar);
                        }
                        result = StockScreenCalculator.analyze(symbol, name, exchange, ((Number) data.get(data.size()-1).get("raw_close")).doubleValue(), bars);
                        analyzed++;
                        com.ruoyi.system.domain.stock.StrategyReport report = (com.ruoyi.system.domain.stock.StrategyReport) result.get("strategyReport");
                        if ("UP".equals(report.getTrendStep().getConclusion())) up++;
                        @SuppressWarnings("unchecked") List<String> signals = (List<String>) result.get("signals");
                        if (!signals.isEmpty()) { matched++; if (Boolean.TRUE.equals(result.get("isST"))) st++; }
                        if (signals.contains("BUY_GOLDEN_CROSS")) golden++;
                        if (signals.contains("BUY_RETRACE")) retrace++;
                        if (signals.contains("BUY_CONVERGENCE")) convergence++;
                    }
                    repository.saveResult(snapshot, result);
                }
                repository.finishScreen(snapshot, analyzed, excluded, up, matched, st, golden, retrace, convergence, reasons);
                log.info("520筛选完成 {}：分析{}，排除{}，候选{}，快照{}", target, analyzed, excluded, matched, snapshot);
                return snapshot;
            }
            catch (Exception e) { repository.failScreen(snapshot, e.getMessage()); throw e; }
        }
    }

    private static String engineHash() throws Exception
    {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        for (Class<?> type : List.of(StockStrategyReportBuilder.class, StockMovingAverage.class, StockScreenCalculator.class))
            try (InputStream stream = type.getResourceAsStream(type.getSimpleName() + ".class"))
            { if (stream == null) throw new IllegalStateException("缺少规则引擎字节码"); digest.update(stream.readAllBytes()); }
        return HexFormat.of().formatHex(digest.digest());
    }
}
