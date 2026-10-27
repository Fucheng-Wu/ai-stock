package com.ruoyi.system.service.impl;

import static org.junit.jupiter.api.Assertions.*;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import com.ruoyi.system.service.support.*;

/** Explicit opt-in: validates public providers without writing market data. */
@EnabledIfEnvironmentVariable(named="STOCK_TEST_LIVE_SOURCE", matches="1")
class StockMarketLiveSourceTest
{
    @Test void marketUniverseAndLatestAdjustedBars() throws Exception
    {
        LocalDate date = LocalDate.parse(System.getenv("STOCK_TEST_SOURCE_DATE"));
        TencentStockMarketSource source = new TencentStockMarketSource(200);
        assertTrue(source.marketReady(date), "Benchmark must include the requested trading day");
        List<StockMarketSource.Security> universe = source.universe();
        assertTrue(universe.size() >= 1000);
        assertEquals("贵州茅台", universe.stream().filter(s -> s.symbol().equals("sh600519")).findFirst().orElseThrow().name());
        for (String exchange : List.of("sh", "sz", "bj"))
        {
            var security = universe.stream().filter(s -> s.exchange().equals(exchange)).findFirst().orElseThrow();
            var bars = source.history(security.symbol(), date, 300);
            assertFalse(bars.isEmpty());
            assertEquals(date, bars.get(bars.size()-1).date(), "Live sample is stale: " + security.symbol());
            assertTrue(bars.size() >= 21);
            System.out.println("Public source verified: " + security.symbol() + ", bars=" + bars.size() + ", latest=" + bars.get(bars.size()-1).date());
        }
        System.out.println("Public source universe=" + universe.size());
    }
}
