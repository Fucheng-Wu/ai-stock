package com.ruoyi.system.mapper.stock;

import org.apache.ibatis.annotations.Param;
import com.ruoyi.system.domain.stock.StockPositionAnalysisSnapshot;

public interface StockPositionAnalysisSnapshotMapper {
  StockPositionAnalysisSnapshot select(@Param("userId") Long userId, @Param("positionId") Long positionId);
  int upsert(StockPositionAnalysisSnapshot snapshot);
}
