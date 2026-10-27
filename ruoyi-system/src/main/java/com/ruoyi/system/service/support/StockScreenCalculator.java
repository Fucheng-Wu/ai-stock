package com.ruoyi.system.service.support;

import java.util.*;
import com.ruoyi.system.domain.stock.*;
import com.ruoyi.system.service.impl.StockStrategyReportBuilder;

/** Shared adapter for database screening and offline snapshot generation. */
public final class StockScreenCalculator
{
    private StockScreenCalculator() { }

    public static Map<String, Object> analyze(String symbol, String name, String exchange, double rawClose, List<StockKlineData> bars)
    {
        if (bars.size() < 21) throw new IllegalArgumentException("至少需要21根日线");
        List<Double> closes = new ArrayList<>();
        for (StockKlineData bar : bars) closes.add(bar.getClose());
        List<Double> ma5 = StockMovingAverage.calculate(closes, 5), ma10 = StockMovingAverage.calculate(closes, 10), ma20 = StockMovingAverage.calculate(closes, 20);
        for (int i = 0; i < bars.size(); i++)
        {
            bars.get(i).setMa5(ma5.get(i)); bars.get(i).setMa10(ma10.get(i)); bars.get(i).setMa20(ma20.get(i));
        }
        StockKlineData current = bars.get(bars.size() - 1), previous = bars.get(bars.size() - 2);
        StockRealtimeData stock = new StockRealtimeData();
        stock.setCode(symbol); stock.setName(name); stock.setDate(current.getDate()); stock.setCurrentPrice(current.getClose());
        stock.setMa5(current.getMa5()); stock.setMa20(current.getMa20()); stock.setMa5Prev(previous.getMa5()); stock.setMa20Prev(previous.getMa20()); stock.setVolume(current.getVolume());
        StrategyReport report = new StockStrategyReportBuilder().build(stock, new ArrayList<>(bars.subList(Math.max(0, bars.size() - 60), bars.size())));
        List<String> signals = new ArrayList<>();
        if ("UP".equals(report.getTrendStep().getConclusion()))
            for (RuleJudgment rule : report.getBuyPointStep().getItems())
                if ("SATISFIED".equals(rule.getStatus())) signals.add(rule.getCode());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("symbol", symbol); result.put("name", name); result.put("exchange", exchange);
        result.put("isST", name.toUpperCase(Locale.ROOT).matches("^S?\\*?ST.*")); result.put("status", "analyzed"); result.put("tradeDate", current.getDate());
        result.put("rawClose", rawClose); result.put("qfqClose", current.getClose()); result.put("ma5", current.getMa5()); result.put("ma20", current.getMa20()); result.put("ma20Prev", previous.getMa20());
        result.put("ma20ChangePct", (current.getMa20() - previous.getMa20()) / previous.getMa20() * 100);
        result.put("distanceMa20Pct", (current.getClose() - current.getMa20()) / current.getMa20() * 100);
        result.put("volumeShares", current.getVolume()); result.put("signals", signals); result.put("strategyReport", report);
        return result;
    }
}
