package com.ruoyi.system.service.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.system.domain.stock.StockWatchlistAnalysisSnapshot;
import com.ruoyi.system.domain.stock.StockWatchlist;
import com.ruoyi.system.mapper.stock.StockWatchlistAnalysisSnapshotMapper;
import com.ruoyi.system.mapper.stock.StockWatchlistMapper;

class StockWatchlistServiceImplTest
{
    @Test
    void normalizesCodesAndRejectsUnsupportedCodes()
    {
        StockWatchlistServiceImpl service = new StockWatchlistServiceImpl(new InMemoryMapper(), new InMemorySnapshotMapper());

        assertEquals("600519", service.normalizeStockCode(" sh600519 "));
        assertEquals("000001", service.normalizeStockCode("sz000001"));
        assertEquals("510300", service.normalizeStockCode("510300"));
        assertEquals("159915", service.normalizeStockCode("sz159915"));
        assertThrows(ServiceException.class, () -> service.normalizeStockCode("hk00700"));
    }

    @Test
    void isolatesUsersAndRejectsDuplicateCodes()
    {
        InMemoryMapper mapper = new InMemoryMapper();
        InMemorySnapshotMapper snapshotMapper = new InMemorySnapshotMapper();
        StockWatchlistServiceImpl service = new StockWatchlistServiceImpl(mapper, snapshotMapper);
        service.add(100L, "600519", "茅台", "admin");
        service.add(101L, "600519", "茅台", "other");

        assertEquals(1, service.list(100L).size());
        assertThrows(ServiceException.class, () -> service.add(100L, "sh600519", null, "admin"));
        service.remove(100L, mapper.rows.get(0).getWatchlistId());
        assertEquals(0, service.list(100L).size());
        assertEquals(1, service.list(101L).size());
        assertEquals(1L, snapshotMapper.deletedWatchlistId);
    }

    private static class InMemoryMapper implements StockWatchlistMapper
    {
        private final List<StockWatchlist> rows = new ArrayList<>();
        private long nextId = 1;

        public List<StockWatchlist> selectByUserId(Long userId) { return rows.stream().filter(row -> userId.equals(row.getUserId())).toList(); }
        public StockWatchlist selectByIdAndUserId(Long watchlistId, Long userId) { return rows.stream().filter(row -> watchlistId.equals(row.getWatchlistId()) && userId.equals(row.getUserId())).findFirst().orElse(null); }
        public boolean existsByUserIdAndCode(Long userId, String stockCode) { return rows.stream().anyMatch(row -> userId.equals(row.getUserId()) && stockCode.equals(row.getStockCode())); }
        public int insertWatchlist(StockWatchlist row) { row.setWatchlistId(nextId++); rows.add(row); return 1; }
        public int deleteByIdAndUserId(Long watchlistId, Long userId) { return rows.removeIf(row -> watchlistId.equals(row.getWatchlistId()) && userId.equals(row.getUserId())) ? 1 : 0; }
    }

    private static class InMemorySnapshotMapper implements StockWatchlistAnalysisSnapshotMapper
    {
        private Long deletedWatchlistId;
        public StockWatchlistAnalysisSnapshot select(Long userId, Long watchlistId) { return null; }
        public int upsert(StockWatchlistAnalysisSnapshot snapshot) { return 1; }
        public int delete(Long userId, Long watchlistId) { deletedWatchlistId = watchlistId; return 1; }
    }
}
