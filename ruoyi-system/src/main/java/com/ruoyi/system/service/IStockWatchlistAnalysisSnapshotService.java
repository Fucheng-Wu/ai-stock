package com.ruoyi.system.service;

import com.ruoyi.system.domain.stock.StockAnalysisResult;

public interface IStockWatchlistAnalysisSnapshotService
{
    StockAnalysisResult get(Long userId, Long watchlistId);
    void save(Long userId, Long watchlistId, StockAnalysisResult result);
}
