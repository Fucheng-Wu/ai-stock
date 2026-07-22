package com.ruoyi.system.domain.stock;

import com.ruoyi.common.core.domain.BaseEntity;

public class StockWatchlist extends BaseEntity
{
    private static final long serialVersionUID = 1L;

    private Long watchlistId;
    private Long userId;
    private String stockCode;
    private String stockName;

    public Long getWatchlistId() { return watchlistId; }
    public void setWatchlistId(Long watchlistId) { this.watchlistId = watchlistId; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getStockCode() { return stockCode; }
    public void setStockCode(String stockCode) { this.stockCode = stockCode; }
    public String getStockName() { return stockName; }
    public void setStockName(String stockName) { this.stockName = stockName; }
}
