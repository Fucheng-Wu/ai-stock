package com.ruoyi.system.service.impl;

import static org.junit.jupiter.api.Assertions.*;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import com.alibaba.fastjson2.JSON;
import com.ruoyi.system.service.support.TencentStockMarketSource;

class StockMarketSourceTest
{
    @Test void validatesPricesFiltersFutureBarsAndConvertsLotsToShares()
    {
        var data=JSON.parseObject("{\"code\":0,\"data\":{\"sz000001\":{\"day\":[[\"2026-10-26\",\"10\",\"11\",\"12\",\"9\",\"123.45\"],[\"2026-10-27\",\"10\",\"11\",\"12\",\"9\",\"1\"]]}}}");
        var bars=TencentStockMarketSource.parseSeries(data,"sz000001",LocalDate.of(2026,10,26),true);
        assertEquals(1,bars.size()); assertEquals(12345,bars.values().iterator().next()[4]);
        data.getJSONObject("data").getJSONObject("sz000001").getJSONArray("day").getJSONArray(0).set(3,"1");
        assertThrows(RuntimeException.class,()->TencentStockMarketSource.parseSeries(data,"sz000001",LocalDate.of(2026,10,26),false));
    }
}
