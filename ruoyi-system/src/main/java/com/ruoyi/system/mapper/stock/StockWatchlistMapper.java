package com.ruoyi.system.mapper.stock;

import java.util.List;
import org.apache.ibatis.annotations.Param;
import com.ruoyi.system.domain.stock.StockWatchlist;

public interface StockWatchlistMapper
{
    List<StockWatchlist> selectByUserId(Long userId);
    StockWatchlist selectByIdAndUserId(@Param("watchlistId") Long watchlistId, @Param("userId") Long userId);
    boolean existsByUserIdAndCode(@Param("userId") Long userId, @Param("stockCode") String stockCode);
    int insertWatchlist(StockWatchlist watchlist);
    int deleteByIdAndUserId(@Param("watchlistId") Long watchlistId, @Param("userId") Long userId);
}
