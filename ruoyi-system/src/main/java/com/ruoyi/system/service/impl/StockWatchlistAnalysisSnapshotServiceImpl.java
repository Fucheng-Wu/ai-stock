package com.ruoyi.system.service.impl;

import java.util.Date;
import org.springframework.stereotype.Service;
import com.alibaba.fastjson2.JSON;
import com.ruoyi.system.domain.stock.StockAnalysisResult;
import com.ruoyi.system.domain.stock.StockWatchlistAnalysisSnapshot;
import com.ruoyi.system.mapper.stock.StockWatchlistAnalysisSnapshotMapper;
import com.ruoyi.system.service.IStockWatchlistAnalysisSnapshotService;

@Service
public class StockWatchlistAnalysisSnapshotServiceImpl implements IStockWatchlistAnalysisSnapshotService
{
    private final StockWatchlistAnalysisSnapshotMapper mapper;

    public StockWatchlistAnalysisSnapshotServiceImpl(StockWatchlistAnalysisSnapshotMapper mapper)
    {
        this.mapper = mapper;
    }

    @Override
    public StockAnalysisResult get(Long userId, Long watchlistId)
    {
        StockWatchlistAnalysisSnapshot snapshot = mapper.select(userId, watchlistId);
        return snapshot == null ? null : JSON.parseObject(snapshot.getAnalysisJson(), StockAnalysisResult.class);
    }

    @Override
    public void save(Long userId, Long watchlistId, StockAnalysisResult result)
    {
        StockWatchlistAnalysisSnapshot snapshot = new StockWatchlistAnalysisSnapshot();
        snapshot.setUserId(userId);
        snapshot.setWatchlistId(watchlistId);
        snapshot.setAnalysisJson(JSON.toJSONString(result));
        snapshot.setAnalyzedAt(new Date());
        mapper.upsert(snapshot);
    }
}
