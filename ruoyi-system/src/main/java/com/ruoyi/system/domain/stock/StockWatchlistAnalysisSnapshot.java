package com.ruoyi.system.domain.stock;

import java.util.Date;

public class StockWatchlistAnalysisSnapshot
{
    private Long snapshotId;
    private Long userId;
    private Long watchlistId;
    private String analysisJson;
    private Date analyzedAt;

    public Long getSnapshotId() { return snapshotId; }
    public void setSnapshotId(Long snapshotId) { this.snapshotId = snapshotId; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Long getWatchlistId() { return watchlistId; }
    public void setWatchlistId(Long watchlistId) { this.watchlistId = watchlistId; }
    public String getAnalysisJson() { return analysisJson; }
    public void setAnalysisJson(String analysisJson) { this.analysisJson = analysisJson; }
    public Date getAnalyzedAt() { return analyzedAt; }
    public void setAnalyzedAt(Date analyzedAt) { this.analyzedAt = analyzedAt; }
}
