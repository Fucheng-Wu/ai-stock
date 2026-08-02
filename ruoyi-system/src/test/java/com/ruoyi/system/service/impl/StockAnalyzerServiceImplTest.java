package com.ruoyi.system.service.impl;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;
import com.alibaba.fastjson2.JSONObject;
import com.ruoyi.system.domain.stock.StockKlineData;
import com.ruoyi.system.domain.stock.StockRealtimeData;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.system.service.ISysConfigService;

class StockAnalyzerServiceImplTest
{
    @Test
    void onlyRequestsAiWhenExplicitlyIncluded()
    {
        assertFalse(StockAnalyzerServiceImpl.shouldCallAi(false));
        assertTrue(StockAnalyzerServiceImpl.shouldCallAi(true));
    }

    @Test
    void normalizesAStockAndEtfCodesWithMarketPrefixes()
    {
        StockAnalyzerServiceImpl service = new StockAnalyzerServiceImpl();

        assertEquals("sh600519", service.normalizeCode("600519"));
        assertEquals("sz000001", service.normalizeCode("000001"));
        assertEquals("sh510300", service.normalizeCode("510300"));
        assertEquals("sz159915", service.normalizeCode("159915"));
        assertEquals("sh510300", service.normalizeCode(" sh510300 "));
        assertThrows(ServiceException.class, () -> service.normalizeCode("hk00700"));
    }

    @Test
    void prefersSysConfigDeepseekKeyAndFallsBackToYaml() throws Exception
    {
        StockAnalyzerServiceImpl service = new StockAnalyzerServiceImpl();
        setField(service, "deepseekApiKey", " yml-key ");
        setField(service, "configService", configServiceReturning(" parameter-key "));
        assertEquals("parameter-key", service.resolveDeepseekApiKey());

        setField(service, "configService", configServiceReturning(" "));
        assertEquals("yml-key", service.resolveDeepseekApiKey());
    }

    @Test
    void parsesStockNameFromTencentRealtimePayload()
    {
        String[] fields = new String[45];
        Arrays.fill(fields, "");
        fields[1] = "贵州茅台";
        fields[3] = "1500.00";
        fields[4] = "1490.00";
        fields[5] = "1495.00";
        fields[30] = "20260723";
        fields[31] = "150000";
        fields[33] = "1510.00";
        fields[34] = "1488.00";
        fields[36] = "12345";
        fields[37] = "185000000";

        StockAnalyzerServiceImpl service = new StockAnalyzerServiceImpl();
        StockRealtimeData stock = service.parseTencentResponse(
            "sh600519", "v_sh600519=\"" + String.join("~", fields) + "\";"
        );

        assertNotNull(stock);
        assertEquals("贵州茅台", stock.getName());
        assertEquals("sh600519", stock.getCode());
    }

    @Test
    void rejectsInvalidTencentRealtimePayload()
    {
        StockAnalyzerServiceImpl service = new StockAnalyzerServiceImpl();
        assertNull(service.parseTencentResponse("sh600519", "v_sh600519=\"\";"));
    }

    @Test
    void buildsLastSixtyChronologicalKlinesWithMovingAveragesFromFullHistory()
    {
        StockAnalyzerServiceImpl service = new StockAnalyzerServiceImpl();
        List<JSONObject> bars = new ArrayList<>();
        LocalDate firstDate = LocalDate.of(2026, 1, 1);
        for (int day = 80; day >= 1; day--)
        {
            JSONObject bar = new JSONObject();
            bar.put("day", firstDate.plusDays(day - 1).toString());
            bar.put("open", day - 0.5);
            bar.put("close", day);
            bar.put("high", day + 1);
            bar.put("low", day - 1);
            bar.put("volume", day * 1000L);
            bars.add(bar);
        }

        List<StockKlineData> result = service.buildKlineChartData(bars);

        assertEquals(60, result.size());
        StockKlineData first = result.get(0);
        assertEquals("2026-01-21", first.getDate());
        assertEquals(20.5, first.getOpen());
        assertEquals(21.0, first.getClose());
        assertEquals(22.0, first.getHigh());
        assertEquals(20.0, first.getLow());
        assertEquals(21000L, first.getVolume());
        assertEquals(19.0, first.getMa5());
        assertEquals(16.5, first.getMa10());
        assertEquals(11.5, first.getMa20());
        assertEquals("2026-03-21", result.get(result.size() - 1).getDate());
    }

    @Test
    void filtersInvalidBarsDefaultsBadVolumeAndLeavesInsufficientMovingAveragesNull()
    {
        StockAnalyzerServiceImpl service = new StockAnalyzerServiceImpl();
        List<JSONObject> bars = new ArrayList<>();
        bars.add(shortBar("2026-01-03", "3", "3", "4", "2", "bad-volume"));
        bars.add(shortBar("2026-01-01", "1", "1", "2", "0", "1000"));
        bars.add(shortBar("2026-01-02", "2", "bad-close", "3", "1", "2000"));
        bars.add(shortBar(null, "2", "2", "3", "1", "2000"));
        bars.add(shortBar("not-a-date", "2", "2", "3", "1", "2000"));

        List<StockKlineData> result = service.buildKlineChartData(bars);

        assertEquals(2, result.size());
        assertEquals("2026-01-01", result.get(0).getDate());
        assertEquals("2026-01-03", result.get(1).getDate());
        assertEquals(0L, result.get(1).getVolume());
        assertNull(result.get(0).getMa5());
        assertNull(result.get(0).getMa10());
        assertNull(result.get(0).getMa20());
    }

    @Test
    void fallsBackToShortKlineFieldsWhenLongAliasesAreBlank()
    {
        StockAnalyzerServiceImpl service = new StockAnalyzerServiceImpl();
        JSONObject bar = shortBar("2026-01-01", "10", "11", "12", "9", "1000");
        bar.put("day", "");
        bar.put("open", "");
        bar.put("close", "");
        bar.put("high", "");
        bar.put("low", "");
        bar.put("volume", "");

        List<StockKlineData> result = service.buildKlineChartData(Arrays.asList(bar));

        assertEquals(1, result.size());
        StockKlineData kline = result.get(0);
        assertEquals("2026-01-01", kline.getDate());
        assertEquals(10.0, kline.getOpen());
        assertEquals(11.0, kline.getClose());
        assertEquals(12.0, kline.getHigh());
        assertEquals(9.0, kline.getLow());
        assertEquals(1000L, kline.getVolume());
    }

    private JSONObject shortBar(String date, String open, String close, String high, String low, String volume)
    {
        JSONObject bar = new JSONObject();
        if (date != null)
        {
            bar.put("d", date);
        }
        bar.put("o", open);
        bar.put("c", close);
        bar.put("h", high);
        bar.put("l", low);
        bar.put("v", volume);
        return bar;
    }

    private ISysConfigService configServiceReturning(String value)
    {
        return (ISysConfigService) Proxy.newProxyInstance(
            ISysConfigService.class.getClassLoader(),
            new Class<?>[]{ISysConfigService.class},
            (proxy, method, args) -> "selectConfigByKey".equals(method.getName()) ? value : null
        );
    }

    private void setField(Object target, String name, Object value) throws Exception
    {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}
