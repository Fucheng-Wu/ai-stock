package com.ruoyi.system.service.impl;

import java.util.List;
import org.springframework.stereotype.Service;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.common.utils.StringUtils;
import com.ruoyi.system.domain.stock.StockWatchlist;
import com.ruoyi.system.mapper.stock.StockWatchlistMapper;
import com.ruoyi.system.service.IStockWatchlistService;

@Service
public class StockWatchlistServiceImpl implements IStockWatchlistService
{
    private final StockWatchlistMapper watchlistMapper;

    public StockWatchlistServiceImpl(StockWatchlistMapper watchlistMapper)
    {
        this.watchlistMapper = watchlistMapper;
    }

    public String normalizeStockCode(String input)
    {
        String code = StringUtils.trim(input).toLowerCase();
        if (code.startsWith("sh") || code.startsWith("sz")) code = code.substring(2);
        if (!code.matches("[036]\\d{5}")) throw new ServiceException("股票代码格式不正确，仅支持沪深 A 股");
        return code;
    }

    @Override
    public List<StockWatchlist> list(Long userId)
    {
        return watchlistMapper.selectByUserId(userId);
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
    public void remove(Long userId, Long watchlistId)
    {
        if (watchlistMapper.deleteByIdAndUserId(watchlistId, userId) == 0) throw new ServiceException("自选股不存在");
    }
}
