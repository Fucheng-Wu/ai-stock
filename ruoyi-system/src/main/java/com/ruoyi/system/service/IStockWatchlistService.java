package com.ruoyi.system.service;

import java.util.List;
import com.ruoyi.system.domain.stock.StockWatchlist;

public interface IStockWatchlistService
{
    List<StockWatchlist> list(Long userId);
    StockWatchlist get(Long userId, Long watchlistId);
    void add(Long userId, String stockCode, String stockName, String userName);
    void remove(Long userId, Long watchlistId);
}
