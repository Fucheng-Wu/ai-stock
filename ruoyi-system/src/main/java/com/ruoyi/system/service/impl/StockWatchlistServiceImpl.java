package com.ruoyi.system.service.impl;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.common.utils.StringUtils;
import com.ruoyi.system.domain.stock.StockWatchlist;
import com.ruoyi.system.mapper.stock.StockWatchlistAnalysisSnapshotMapper;
import com.ruoyi.system.mapper.stock.StockWatchlistMapper;
import com.ruoyi.system.service.IStockWatchlistService;
import com.ruoyi.system.service.support.StockCodeUtils;

@Service
public class StockWatchlistServiceImpl implements IStockWatchlistService
{
    private final StockWatchlistMapper watchlistMapper;
    private final StockWatchlistAnalysisSnapshotMapper snapshotMapper;

    public StockWatchlistServiceImpl(StockWatchlistMapper watchlistMapper,
            StockWatchlistAnalysisSnapshotMapper snapshotMapper)
    {
        this.watchlistMapper = watchlistMapper;
        this.snapshotMapper = snapshotMapper;
    }

    public String normalizeStockCode(String input)
    {
        return StockCodeUtils.normalizePlainCode(input);
    }

    @Override
    public List<StockWatchlist> list(Long userId)
    {
        return watchlistMapper.selectByUserId(userId);
    }

    @Override
    public StockWatchlist get(Long userId, Long watchlistId)
    {
        StockWatchlist watchlist = watchlistMapper.selectByIdAndUserId(watchlistId, userId);
        if (watchlist == null) throw new ServiceException("自选股票不存在");
        return watchlist;
    }

    @Override
    public void add(Long userId, String stockCode, String stockName, String userName)
    {
        String code = normalizeStockCode(stockCode);
        if (watchlistMapper.existsByUserIdAndCode(userId, code)) throw new ServiceException("该股票已在自选列表中");
        StockWatchlist watchlist = new StockWatchlist();
        watchlist.setUserId(userId);
        watchlist.setStockCode(code);
        watchlist.setStockName(StringUtils.trim(stockName));
        watchlist.setCreateBy(userName);
        watchlistMapper.insertWatchlist(watchlist);
    }

    @Override
    @Transactional
    public void remove(Long userId, Long watchlistId)
    {
        if (watchlistMapper.deleteByIdAndUserId(watchlistId, userId) == 0)
        {
            throw new ServiceException("自选股票不存在");
        }
        snapshotMapper.delete(userId, watchlistId);
    }
}
