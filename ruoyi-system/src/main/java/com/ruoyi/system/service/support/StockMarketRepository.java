package com.ruoyi.system.service.support;

import java.sql.*;
import java.time.*;
import java.util.*;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionTemplate;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.ruoyi.common.exception.ServiceException;

@Repository
public class StockMarketRepository
{
    public static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transaction;

    public StockMarketRepository(JdbcTemplate jdbc)
    {
        this.jdbc = jdbc;
        transaction = new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource())));
    }

    public final class PipelineLock implements AutoCloseable
    {
        private final Connection connection;
        private final String name;
        private PipelineLock(Connection connection, String name) { this.connection = connection; this.name = name; }
        @Override public void close() throws SQLException
        {
            try (PreparedStatement statement = connection.prepareStatement("SELECT RELEASE_LOCK(?)")) { statement.setString(1, name); statement.execute(); }
            finally { connection.close(); }
        }
    }

    public PipelineLock lock() throws SQLException
    {
        DataSource source = Objects.requireNonNull(jdbc.getDataSource());
        Connection connection = source.getConnection();
        String name = "stock-market:" + connection.getCatalog();
        if (name.length() > 64) name = name.substring(0, 64);
        try (PreparedStatement statement = connection.prepareStatement("SELECT GET_LOCK(?,0)"))
        {
            statement.setString(1, name);
            try (ResultSet result = statement.executeQuery())
            {
                if (!result.next() || result.getInt(1) != 1) throw new ServiceException("行情同步或筛选正在执行，请稍后补跑");
            }
            return new PipelineLock(connection, name);
        }
        catch (Exception e) { connection.close(); throw e; }
    }

    private static LocalDateTime now() { return LocalDateTime.now(ZONE); }
    public Map<String, Object> latestSync(LocalDate date)
    {
        List<Map<String, Object>> rows = date == null
            ? jdbc.queryForList("SELECT * FROM stock_market_sync_run ORDER BY id DESC LIMIT 1")
            : jdbc.queryForList("SELECT * FROM stock_market_sync_run WHERE trade_date=? ORDER BY id DESC LIMIT 1", date);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public void beginSync(String run, LocalDate date)
    {
        jdbc.update("INSERT INTO stock_market_sync_run(run_id,trade_date,status,source,started_at) VALUES (?,?,'RUNNING',?,?)", run, date, "新浪A股清单、腾讯不复权/前复权日线", now());
    }

    public void registerUniverse(String run, LocalDate date, List<StockMarketSource.Security> securities)
    {
        transaction.executeWithoutResult(status -> {
            List<Object[]> rows = securities.stream().map(s -> new Object[]{s.symbol(), s.symbol().substring(2), s.exchange(), s.name(), date, date, now()}).toList();
            jdbc.batchUpdate("""
                INSERT INTO stock_market_security(symbol,code,exchange,name,first_seen_date,last_seen_date,updated_at)
                VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=IF(VALUES(last_seen_date)>=last_seen_date,VALUES(name),name),
                active=1,last_seen_date=GREATEST(last_seen_date,VALUES(last_seen_date)),updated_at=VALUES(updated_at)
                """, rows);
            jdbc.batchUpdate("INSERT INTO stock_market_sync_item(run_id,symbol,name,exchange,status) VALUES (?,?,?,?,'PENDING')",
                securities.stream().map(s -> new Object[]{run, s.symbol(), s.name(), s.exchange()}).toList());
            jdbc.update("UPDATE stock_market_sync_run SET expected_count=? WHERE run_id=?", securities.size(), run);
            jdbc.update("UPDATE stock_market_security SET active=0 WHERE last_seen_date<?", date);
        });
    }

    public void saveBars(String run, LocalDate target, StockMarketSource.Security security, List<StockMarketSource.Bar> bars)
    {
        transaction.executeWithoutResult(status -> {
            jdbc.batchUpdate("""
                INSERT INTO stock_market_daily(symbol,trade_date,raw_open,raw_high,raw_low,raw_close,qfq_open,qfq_high,qfq_low,qfq_close,volume_shares,qfq_as_of_date,last_sync_id,fetched_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE raw_open=VALUES(raw_open),raw_high=VALUES(raw_high),raw_low=VALUES(raw_low),raw_close=VALUES(raw_close),
                qfq_open=VALUES(qfq_open),qfq_high=VALUES(qfq_high),qfq_low=VALUES(qfq_low),qfq_close=VALUES(qfq_close),volume_shares=VALUES(volume_shares),
                qfq_as_of_date=VALUES(qfq_as_of_date),last_sync_id=VALUES(last_sync_id),fetched_at=VALUES(fetched_at)
                """, bars.stream().map(b -> new Object[]{security.symbol(), b.date(), b.rawOpen(), b.rawHigh(), b.rawLow(), b.rawClose(), b.qfqOpen(), b.qfqHigh(), b.qfqLow(), b.qfqClose(), b.volumeShares(), target, run, now()}).toList());
            jdbc.update("UPDATE stock_market_sync_item SET status='COMPLETE',row_count=?,last_bar_date=?,error_message=NULL WHERE run_id=? AND symbol=?",
                bars.size(), bars.get(bars.size()-1).date(), run, security.symbol());
        });
    }

    public void failItem(String run, String symbol, String message)
    {
        jdbc.update("UPDATE stock_market_sync_item SET status='ERROR',error_message=? WHERE run_id=? AND symbol=?", shorten(message, 1000), run, symbol);
    }
    public void finishSync(String run, String state, String message)
    {
        jdbc.update("""
            UPDATE stock_market_sync_run SET status=?,finished_at=?,error_message=?,
            completed_count=(SELECT COUNT(*) FROM stock_market_sync_item WHERE run_id=? AND status='COMPLETE'),
            failed_count=(SELECT COUNT(*) FROM stock_market_sync_item WHERE run_id=? AND status<>'COMPLETE') WHERE run_id=?
            """, state, now(), shorten(message, 2000), run, run, run);
    }
    public List<Map<String, Object>> universe(String sync)
    {
        return jdbc.queryForList("SELECT symbol,name,exchange FROM stock_market_sync_item WHERE run_id=? ORDER BY symbol", sync);
    }
    public List<Map<String, Object>> bars(String sync, String symbol, LocalDate date)
    {
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT * FROM stock_market_daily WHERE last_sync_id=? AND symbol=? AND qfq_as_of_date=? AND trade_date<=? ORDER BY trade_date DESC LIMIT 80", sync, symbol, date, date);
        Collections.reverse(rows); return rows;
    }
    public void beginScreen(String snapshot, String sync, LocalDate date, String hash, int expected)
    {
        jdbc.update("INSERT INTO stock_screen_run(snapshot_id,sync_run_id,trade_date,status,engine_sha256,universe_count,exclusion_counts,created_at) VALUES (?,?,?,'RUNNING',?,?, '{}',?)",
            snapshot, sync, date, hash, expected, now());
    }
    public void saveResult(String snapshot, Map<String, Object> result)
    {
        @SuppressWarnings("unchecked") List<String> signals = (List<String>) result.getOrDefault("signals", List.of());
        jdbc.update("INSERT INTO stock_screen_result(snapshot_id,symbol,name,exchange,is_st,result_status,reason_code,golden_cross,retrace,convergence,result_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            snapshot, result.get("symbol"), result.get("name"), result.get("exchange"), Boolean.TRUE.equals(result.get("isST")), result.get("status"), result.get("reason"),
            signals.contains("BUY_GOLDEN_CROSS"), signals.contains("BUY_RETRACE"), signals.contains("BUY_CONVERGENCE"), JSON.toJSONString(result));
    }
    public void finishScreen(String snapshot, int analyzed, int excluded, int up, int matched, int st, int golden, int retrace, int convergence, Map<String, Integer> reasons)
    {
        int changed = jdbc.update("UPDATE stock_screen_run SET status='COMPLETE',analyzed_count=?,excluded_count=?,uptrend_count=?,matched_count=?,matched_st_count=?,golden_count=?,retrace_count=?,convergence_count=?,exclusion_counts=?,finished_at=? WHERE snapshot_id=? AND status='RUNNING' AND universe_count=? AND universe_count=(SELECT COUNT(*) FROM stock_screen_result WHERE snapshot_id=?)",
            analyzed, excluded, up, matched, st, golden, retrace, convergence, JSON.toJSONString(reasons), now(), snapshot, analyzed + excluded, snapshot);
        if (changed != 1) throw new ServiceException("筛选结果覆盖数量不一致，未发布不完整快照");
    }
    public void failScreen(String snapshot, String message)
    {
        jdbc.update("UPDATE stock_screen_run SET status='FAILED',finished_at=?,error_message=? WHERE snapshot_id=?", now(), shorten(message, 2000), snapshot);
    }

    private Map<String, Object> selectScreen(String snapshot, LocalDate date)
    {
        if (snapshot != null && (!snapshot.matches("[A-Za-z0-9_-]{1,120}"))) throw new ServiceException("snapshotId格式无效");
        String where = "status='COMPLETE'";
        List<Object> parameters = new ArrayList<>();
        if (snapshot != null) { where += " AND snapshot_id=?"; parameters.add(snapshot); }
        if (date != null) { where += " AND trade_date=?"; parameters.add(date); }
        List<Map<String, Object>> rows = jdbc.queryForList("SELECT *,DATE_FORMAT(finished_at,'%Y-%m-%d %H:%i:%s.%f') AS finished_text FROM stock_screen_run WHERE " + where + " ORDER BY trade_date DESC,id DESC LIMIT 1", parameters.toArray());
        if (rows.isEmpty()) throw new ServiceException(date == null ? "没有可用的MySQL筛选快照，请先完成行情迁移或定时筛选" : "没有" + date + "的已完成筛选快照，不能用旧数据冒充该日行情");
        return rows.get(0);
    }

    private Map<String, Object> metadata(Map<String, Object> row)
    {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("snapshotId", row.get("snapshot_id")); data.put("tradeDate", String.valueOf(row.get("trade_date")));
        LocalDateTime time = LocalDateTime.parse(String.valueOf(row.get("finished_text")).replace(' ', 'T'));
        data.put("generatedAt", time.atZone(ZONE).toOffsetDateTime().toString());
        data.put("source", "MySQL全市场日线；新浪A股清单、腾讯行情及Java 520规则引擎");
        data.put("isRealtime", false); data.put("adjustment", "qfq"); data.put("maPrecision", 2); data.put("volumeUnit", "shares"); data.put("snapshotExcludesST", false);
        Map<String, Object> coverage = new LinkedHashMap<>();
        coverage.put("universe", row.get("universe_count")); coverage.put("analyzed", row.get("analyzed_count")); coverage.put("excluded", row.get("excluded_count"));
        coverage.put("exclusions", JSON.parseObject(String.valueOf(row.get("exclusion_counts")))); coverage.put("uptrend", row.get("uptrend_count"));
        coverage.put("matched", row.get("matched_count")); coverage.put("matchedST", row.get("matched_st_count"));
        coverage.put("signals", Map.of("BUY_GOLDEN_CROSS", row.get("golden_count"), "BUY_RETRACE", row.get("retrace_count"), "BUY_CONVERGENCE", row.get("convergence_count")));
        data.put("coverage", coverage); data.put("note", "仅对应标注交易日的收盘快照，不代表盘中实时买点；按代码排序，不代表胜率或收益。");
        return data;
    }

    public Map<String, Object> query(String snapshot, LocalDate date, String signal, String exchange, String keyword, boolean excludeST, int page, int size)
    {
        if (page < 1 || page > 10000 || size < 1 || size > 50) throw new ServiceException("分页参数无效，每页最多50条");
        if (!Set.of("ALL", "GOLDEN_CROSS", "RETRACE", "CONVERGENCE").contains(signal)) throw new ServiceException("买点类型无效");
        if (!Set.of("ALL", "sh", "sz", "bj").contains(exchange)) throw new ServiceException("交易所无效");
        if (keyword == null) keyword = "";
        keyword = keyword.trim(); if (keyword.length() > 40) throw new ServiceException("关键词最多40个字符");
        Map<String, Object> run = selectScreen(snapshot, date), data = metadata(run);
        String where = "snapshot_id=? AND result_status='analyzed' AND (golden_cross=1 OR retrace=1 OR convergence=1)";
        List<Object> args = new ArrayList<>(); args.add(run.get("snapshot_id"));
        where += switch (signal) { case "GOLDEN_CROSS" -> " AND golden_cross=1"; case "RETRACE" -> " AND retrace=1"; case "CONVERGENCE" -> " AND convergence=1"; default -> ""; };
        if (!"ALL".equals(exchange)) { where += " AND exchange=?"; args.add(exchange); }
        if (excludeST) where += " AND is_st=0";
        if (!keyword.isEmpty())
        {
            where += " AND (symbol LIKE ? ESCAPE '!' OR name LIKE ? ESCAPE '!')";
            String escaped = "%" + keyword.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
            args.add(escaped); args.add(escaped);
        }
        Long total = jdbc.queryForObject("SELECT COUNT(*) FROM stock_screen_result WHERE " + where, Long.class, args.toArray());
        List<Object> paged = new ArrayList<>(args); paged.add(size); paged.add((page - 1) * size);
        List<Map<String, Object>> records = jdbc.queryForList("SELECT result_json FROM stock_screen_result WHERE " + where + " ORDER BY symbol LIMIT ? OFFSET ?", paged.toArray());
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Map<String, Object> record : records)
        {
            JSONObject full = JSON.parseObject(String.valueOf(record.get("result_json")));
            Map<String, Object> item = new LinkedHashMap<>(); item.put("stockCode", full.getString("symbol"));
            for (String key : List.of("name", "exchange", "isST", "signals", "rawClose", "qfqClose", "ma5", "ma20", "ma20ChangePct", "distanceMa20Pct", "volumeShares")) item.put(key, full.get(key));
            rows.add(item);
        }
        data.put("filters", Map.of("signal", signal, "exchange", exchange, "keyword", keyword, "excludeST", excludeST));
        data.put("total", total); data.put("page", page); data.put("pageSize", size); data.put("hasNextPage", (long) page * size < total); data.put("rows", rows);
        return data;
    }

    public Map<String, Object> detail(String code, String snapshot, LocalDate date)
    {
        if (code == null || !code.trim().matches("(?i)(?:(?:sh|sz|bj))?\\d{6}")) throw new ServiceException("请提供明确的A股代码");
        code = code.trim().toLowerCase(Locale.ROOT);
        Map<String, Object> run = selectScreen(snapshot, date), data = metadata(run);
        List<Map<String, Object>> records = jdbc.queryForList("SELECT result_json FROM stock_screen_result WHERE snapshot_id=? AND " + (code.length() == 8 ? "symbol=?" : "SUBSTRING(symbol,3)=?"), run.get("snapshot_id"), code);
        data.put("found", records.size() == 1); data.put("requiresSelection", records.size() > 1); data.put("stockCode", code);
        data.put("record", records.size() == 1 ? JSON.parseObject(String.valueOf(records.get(0).get("result_json"))) : null);
        if (records.size() > 1) data.put("matches", records.stream().map(row -> { JSONObject full = JSON.parseObject(String.valueOf(row.get("result_json"))); return Map.of("stockCode", full.getString("symbol"), "name", full.getString("name")); }).toList());
        if (records.isEmpty()) data.put("reason", "该代码不在这份快照中，不能据此判断买点");
        return data;
    }

    public static String shorten(String text, int length) { return text == null ? null : text.substring(0, Math.min(length, text.length())); }
}
