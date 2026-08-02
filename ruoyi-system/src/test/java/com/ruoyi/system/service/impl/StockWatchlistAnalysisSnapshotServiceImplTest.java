package com.ruoyi.system.service.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import com.ruoyi.system.domain.stock.StockAnalysisResult;
import com.ruoyi.system.domain.stock.StockWatchlistAnalysisSnapshot;
import com.ruoyi.system.mapper.stock.StockWatchlistAnalysisSnapshotMapper;

class StockWatchlistAnalysisSnapshotServiceImplTest
{
    @Test
    void mapsSnapshotColumnsExplicitly() throws Exception
    {
        try (InputStream input = getClass().getClassLoader()
                .getResourceAsStream("mapper/stock/StockWatchlistAnalysisSnapshotMapper.xml"))
        {
            String xml = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            assertEquals(true, xml.contains("<resultMap id=\"Snapshot\""));
            assertEquals(true, xml.contains("resultMap=\"Snapshot\""));
            assertEquals(true, xml.contains("stock_watchlist_analysis_snapshot"));
        }
    }

    @Test
    void savesLatestResultForOneUserAndWatchlist()
    {
        StockWatchlistAnalysisSnapshotServiceImpl service =
                new StockWatchlistAnalysisSnapshotServiceImpl(new MemoryMapper());
        service.save(1L, 10L, result("first"));
        service.save(1L, 10L, result("second"));
        assertEquals("second", service.get(1L, 10L).getAiAdvice());
        assertNull(service.get(2L, 10L));
    }

    private StockAnalysisResult result(String advice)
    {
        StockAnalysisResult result = new StockAnalysisResult();
        result.setAiAdvice(advice);
        return result;
    }

    private static class MemoryMapper implements StockWatchlistAnalysisSnapshotMapper
    {
        private final Map<String, StockWatchlistAnalysisSnapshot> values = new HashMap<>();
        public StockWatchlistAnalysisSnapshot select(Long userId, Long watchlistId) { return values.get(userId + ":" + watchlistId); }
        public int upsert(StockWatchlistAnalysisSnapshot snapshot) { values.put(snapshot.getUserId() + ":" + snapshot.getWatchlistId(), snapshot); return 1; }
        public int delete(Long userId, Long watchlistId) { return values.remove(userId + ":" + watchlistId) == null ? 0 : 1; }
    }
}
