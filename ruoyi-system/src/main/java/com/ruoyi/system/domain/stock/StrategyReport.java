package com.ruoyi.system.domain.stock;

public class StrategyReport
{
    private RuleJudgment trendStep;
    private BuyPointStep buyPointStep;
    private ExitStep exitStep;
    private RuleJudgment positionStep;
    private String summary;

    public RuleJudgment getTrendStep() { return trendStep; }
    public void setTrendStep(RuleJudgment trendStep) { this.trendStep = trendStep; }
    public BuyPointStep getBuyPointStep() { return buyPointStep; }
    public void setBuyPointStep(BuyPointStep buyPointStep) { this.buyPointStep = buyPointStep; }
    public ExitStep getExitStep() { return exitStep; }
    public void setExitStep(ExitStep exitStep) { this.exitStep = exitStep; }
    public RuleJudgment getPositionStep() { return positionStep; }
    public void setPositionStep(RuleJudgment positionStep) { this.positionStep = positionStep; }
    public String getSummary() { return summary; }
    public void setSummary(String summary) { this.summary = summary; }
}
