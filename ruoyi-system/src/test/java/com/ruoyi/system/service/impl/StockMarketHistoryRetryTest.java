package com.ruoyi.system.service.impl;

import static org.junit.jupiter.api.Assertions.*;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.Test;
import com.ruoyi.system.service.support.TencentStockMarketSource;

class StockMarketHistoryRetryTest
{
    private static final LocalDate DATE = LocalDate.of(2026, 11, 6);
    private static Map<LocalDate, double[]> bars(LocalDate date, long volume)
    { return Map.of(date, new double[]{10, 12, 9, 11, volume}); }

    private static class Source extends TencentStockMarketSource
    {
        final List<Map<LocalDate, double[]>> responses;
        int calls, retries;
        boolean invalid;
        Source(List<Map<LocalDate, double[]>> responses) { super(200); this.responses = responses; }
        @Override protected Map<LocalDate, double[]> series(String symbol, LocalDate target, int limit, boolean adjusted)
        {
            assertEquals(calls % 2 == 1, adjusted, "both price series must be refetched as a pair");
            if (invalid) throw new IllegalStateException("腾讯日线价格无效");
            return responses.get(calls++ % responses.size());
        }
        @Override protected void pauseHistoryRetry(int attempt)
        {
            retries++;
            if (Thread.currentThread().isInterrupted()) throw new IllegalStateException("行情同步已中断");
        }
    }

    @Test void refetchesBothSeriesAfterDelayedAdjustedDay()
    {
        Source source = new Source(List.of(bars(DATE, 100), bars(DATE.minusDays(1), 100), bars(DATE, 100), bars(DATE, 100)));
        var result = source.history("sz000001", DATE, 300);
        assertEquals(4, source.calls); assertEquals(1, source.retries);
        assertEquals(1, result.size()); assertEquals(DATE, result.get(0).date());
        assertEquals(100, result.get(0).volumeShares());
    }

    @Test void permanentMismatchRemainsAFailureWithDiagnosticDates()
    {
        Source source = new Source(List.of(bars(DATE, 100), bars(DATE.minusDays(1), 100)));
        var error = assertThrows(IllegalStateException.class, () -> source.history("sz000001", DATE, 300));
        assertEquals(6, source.calls); assertEquals(2, source.retries);
        assertTrue(error.getMessage().contains("仅不复权=[2026-11-06]"));
        assertTrue(error.getMessage().contains("仅前复权=[2026-11-05]"));
    }

    @Test void volumeMismatchIsRetriedButNeverAccepted()
    {
        Source source = new Source(List.of(bars(DATE, 100), bars(DATE, 200)));
        assertTrue(assertThrows(IllegalStateException.class, () -> source.history("sz000001", DATE, 300)).getMessage().contains("成交量不一致"));
        assertEquals(6, source.calls);
    }

    @Test void emptySeriesAndMalformedPricesCannotProduceACompleteHistory()
    {
        Source empty = new Source(List.of(Map.of(), Map.of()));
        assertThrows(IllegalStateException.class, () -> empty.history("sz000001", DATE, 300));
        assertEquals(6, empty.calls);
        Source invalid = new Source(List.of()); invalid.invalid = true;
        assertThrows(IllegalStateException.class, () -> invalid.history("sz000001", DATE, 300));
        assertEquals(0, invalid.retries, "invalid price data is not a transient pairing error");
    }

    @Test void interruptionStopsPairRetries()
    {
        Source source = new Source(List.of(bars(DATE, 100), Map.of()));
        Thread.currentThread().interrupt();
        try
        {
            assertThrows(IllegalStateException.class, () -> source.history("sz000001", DATE, 300));
            assertTrue(Thread.currentThread().isInterrupted()); assertEquals(2, source.calls);
        }
        finally { Thread.interrupted(); }
    }
}
