package com.ruoyi.system.service.support;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;
import com.alibaba.fastjson2.*;

/** Fixed public providers; request pacing is shared by all worker threads. */
@Component
public class TencentStockMarketSource implements StockMarketSource
{
    private static final String SINA = "https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/";
    private static final String TENCENT = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get";
    private final RestTemplate http;
    private final long intervalNanos;
    private long lastRequest;

    public TencentStockMarketSource(@Value("${stock.market.request-interval-ms:200}") int interval)
    {
        if (interval < 100) throw new IllegalArgumentException("行情请求间隔不能小于100毫秒");
        intervalNanos = interval * 1_000_000L;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(6000); factory.setReadTimeout(20000);
        http = new RestTemplate(factory);
    }

    private synchronized void pace()
    {
        long delay = intervalNanos - (System.nanoTime() - lastRequest);
        if (delay > 0) pause((delay + 999999) / 1000000);
        if (Thread.currentThread().isInterrupted()) throw new IllegalStateException("行情同步已中断");
        lastRequest = System.nanoTime();
    }

    private static void pause(long milliseconds)
    {
        try { Thread.sleep(milliseconds); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException("行情同步已中断", e); }
    }

    private Object request(String url, Map<String, Object> parameters)
    {
        RuntimeException failure = null;
        for (int attempt = 0; attempt < 3; attempt++)
        {
            pace();
            try
            {
                UriComponentsBuilder builder = UriComponentsBuilder.fromUriString(url);
                parameters.forEach(builder::queryParam);
                return JSON.parse(http.getForObject(builder.build().encode().toUri(), String.class));
            }
            catch (RuntimeException e)
            {
                failure = e;
                if (Thread.currentThread().isInterrupted()) throw e;
                if (attempt < 2) pause(1000L << attempt);
            }
        }
        throw new IllegalStateException("公开行情接口暂不可用（" + failure.getClass().getSimpleName() + "）");
    }

    @Override public List<Security> universe()
    {
        int expected = Integer.parseInt(String.valueOf(request(SINA + "Market_Center.getHQNodeStockCount", Map.of("node", "hs_a"))));
        if (expected < 1000 || expected > 20000) throw new IllegalStateException("A股股票清单数量异常");
        Map<String, Security> result = new TreeMap<>();
        for (int page = 1; result.size() < expected; page++)
        {
            Object payload = request(SINA + "Market_Center.getHQNodeData", Map.of("node", "hs_a", "page", page, "num", 80, "sort", "symbol", "asc", 1, "symbol", ""));
            if (!(payload instanceof JSONArray rows) || rows.isEmpty() || page > 300) throw new IllegalStateException("A股股票清单分页不完整");
            for (Object row : rows)
            {
                JSONObject item = (JSONObject) row;
                String symbol = item.getString("symbol"), name = item.getString("name");
                if (symbol == null || !symbol.matches("(?:sh6\\d{5}|sz[03]\\d{5}|bj\\d{6})") || name == null || name.isBlank() || name.length() > 80)
                    throw new IllegalStateException("A股股票清单格式发生变化");
                if (result.putIfAbsent(symbol, new Security(symbol, name, symbol.substring(0, 2))) != null)
                    throw new IllegalStateException("A股股票清单包含重复代码");
            }
        }
        if (result.size() != expected) throw new IllegalStateException("A股股票清单覆盖数量不一致");
        return new ArrayList<>(result.values());
    }

    private Map<LocalDate, double[]> series(String symbol, LocalDate target, int limit, boolean adjusted)
    {
        JSONObject payload = (JSONObject) request(TENCENT, Map.of("param", symbol + ",day," + target.minusYears(3) + "," + target + "," + limit + "," + (adjusted ? "qfq" : "")));
        return parseSeries(payload, symbol, target, adjusted);
    }

    public static Map<LocalDate, double[]> parseSeries(JSONObject payload, String symbol, LocalDate target, boolean adjusted)
    {
        if (payload == null || payload.getIntValue("code", -1) != 0 || payload.getJSONObject("data") == null)
            throw new IllegalStateException("腾讯日线响应无效");
        JSONObject item = payload.getJSONObject("data").getJSONObject(symbol);
        if (item == null) throw new IllegalStateException("腾讯日线缺少目标代码");
        JSONArray rows = adjusted && item.containsKey("qfqday") ? item.getJSONArray("qfqday") : item.getJSONArray("day");
        if (rows == null) throw new IllegalStateException("腾讯日线缺少价格序列");
        Map<LocalDate, double[]> result = new TreeMap<>();
        for (int i = 0; i < rows.size(); i++)
        {
            JSONArray row = rows.getJSONArray(i);
            if (row.size() < 6) throw new IllegalStateException("腾讯日线字段不足");
            LocalDate date = LocalDate.parse(row.getString(0));
            if (date.isAfter(target)) continue;
            double open = row.getDoubleValue(1), close = row.getDoubleValue(2), high = row.getDoubleValue(3), low = row.getDoubleValue(4);
            for (double price : new double[]{open, close, high, low})
                if (!Double.isFinite(price) || price <= 0) throw new IllegalStateException("腾讯日线价格无效");
            if (high + 0.00001 < Math.max(open, close) || low - 0.00001 > Math.min(open, close) || high < low)
                throw new IllegalStateException("腾讯日线OHLC关系无效");
            long volume = new BigDecimal(row.getString(5)).multiply(BigDecimal.valueOf(100)).longValueExact();
            if (volume < 0) throw new IllegalStateException("腾讯日线成交量无效");
            double[] values = {open, high, low, close, volume};
            double[] previous = result.putIfAbsent(date, values);
            if (previous != null && !Arrays.equals(previous, values)) throw new IllegalStateException("腾讯日线日期重复且数值冲突");
        }
        return result;
    }

    @Override public boolean marketReady(LocalDate target)
    {
        return series("sh000001", target, 5, false).containsKey(target);
    }

    @Override public List<Bar> history(String symbol, LocalDate target, int limit)
    {
        Map<LocalDate, double[]> raw = series(symbol, target, limit, false), qfq = series(symbol, target, limit, true);
        if (raw.isEmpty() || !raw.keySet().equals(qfq.keySet())) throw new IllegalStateException("不复权与前复权日线日期不完整");
        List<Bar> result = new ArrayList<>();
        for (LocalDate date : raw.keySet())
        {
            double[] r = raw.get(date), q = qfq.get(date);
            if (r[4] != q[4]) throw new IllegalStateException("不复权与前复权成交量不一致");
            result.add(new Bar(date, r[0], r[1], r[2], r[3], q[0], q[1], q[2], q[3], (long) r[4]));
        }
        return result;
    }
}
