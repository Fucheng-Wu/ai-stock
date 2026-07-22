package com.ruoyi.system.service.impl;

import java.util.Date;
import org.springframework.stereotype.Service;
import com.alibaba.fastjson2.JSON;
import com.ruoyi.system.domain.stock.StockAnalysisResult;
import com.ruoyi.system.domain.stock.StockPositionAnalysisSnapshot;
import com.ruoyi.system.mapper.stock.StockPositionAnalysisSnapshotMapper;
import com.ruoyi.system.service.IStockPositionAnalysisSnapshotService;

@Service
public class StockPositionAnalysisSnapshotServiceImpl implements IStockPositionAnalysisSnapshotService {
  private final StockPositionAnalysisSnapshotMapper mapper;
  public StockPositionAnalysisSnapshotServiceImpl(StockPositionAnalysisSnapshotMapper mapper) { this.mapper = mapper; }
  public StockAnalysisResult get(Long userId, Long positionId) {
    StockPositionAnalysisSnapshot snapshot = mapper.select(userId, positionId);
    return snapshot == null ? null : JSON.parseObject(snapshot.getAnalysisJson(), StockAnalysisResult.class);
  }
  public void save(Long userId, Long positionId, StockAnalysisResult result) {
    StockPositionAnalysisSnapshot snapshot = new StockPositionAnalysisSnapshot();
    snapshot.setUserId(userId); snapshot.setPositionId(positionId); snapshot.setAnalysisJson(JSON.toJSONString(result)); snapshot.setAnalyzedAt(new Date());
    mapper.upsert(snapshot);
  }
}
