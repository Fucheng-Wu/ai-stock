package com.ruoyi.system.domain.stock;

public class StockAnalysisResult
{
    private StockRealtimeData stock;
    private AnalysisSignal signal;
    private String trend20ma;
    private String trendDesc;
    private String aiAdvice;
    private String aiReason;
    private String riskLevel;

    public StockRealtimeData getStock() { return stock; }
    public void setStock(StockRealtimeData stock) { this.stock = stock; }
    public AnalysisSignal getSignal() { return signal; }
    public void setSignal(AnalysisSignal signal) { this.signal = signal; }
    public String getTrend20ma() { return trend20ma; }
    public void setTrend20ma(String trend20ma) { this.trend20ma = trend20ma; }
    public String getTrendDesc() { return trendDesc; }
    public void setTrendDesc(String trendDesc) { this.trendDesc = trendDesc; }
    public String getAiAdvice() { return aiAdvice; }
    public void setAiAdvice(String aiAdvice) { this.aiAdvice = aiAdvice; }
    public String getAiReason() { return aiReason; }
    public void setAiReason(String aiReason) { this.aiReason = aiReason; }
    public String getRiskLevel() { return riskLevel; }
    public void setRiskLevel(String riskLevel) { this.riskLevel = riskLevel; }
}
