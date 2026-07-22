package com.ruoyi.system.domain.stock;

import java.util.Date;

public class StockPositionAnalysisSnapshot {
  private Long snapshotId;
  private Long userId;
  private Long positionId;
  private String analysisJson;
  private Date analyzedAt;
  public Long getSnapshotId() { return snapshotId; }
  public void setSnapshotId(Long snapshotId) { this.snapshotId = snapshotId; }
  public Long getUserId() { return userId; }
  public void setUserId(Long userId) { this.userId = userId; }
  public Long getPositionId() { return positionId; }
  public void setPositionId(Long positionId) { this.positionId = positionId; }
  public String getAnalysisJson() { return analysisJson; }
  public void setAnalysisJson(String analysisJson) { this.analysisJson = analysisJson; }
  public Date getAnalyzedAt() { return analyzedAt; }
  public void setAnalyzedAt(Date analyzedAt) { this.analyzedAt = analyzedAt; }
}
