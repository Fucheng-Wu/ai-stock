package com.ruoyi.system.service;

import com.ruoyi.system.domain.stock.StockAnalysisResult;

public interface IStockPositionAnalysisSnapshotService {
  StockAnalysisResult get(Long userId, Long positionId);
  void save(Long userId, Long positionId, StockAnalysisResult result);
}
