package com.ruoyi.system.mapper.stock;

import org.apache.ibatis.annotations.Param;
import com.ruoyi.system.domain.stock.StockWatchlistAnalysisSnapshot;

public interface StockWatchlistAnalysisSnapshotMapper
{
    StockWatchlistAnalysisSnapshot select(@Param("userId") Long userId, @Param("watchlistId") Long watchlistId);
    int upsert(StockWatchlistAnalysisSnapshot snapshot);
    int delete(@Param("userId") Long userId, @Param("watchlistId") Long watchlistId);
}
