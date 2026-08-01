package com.ruoyi.system.domain.stock;

import java.util.Arrays;
import java.util.List;

public class ExitStep
{
    private RuleJudgment shortStop;
    private RuleJudgment trendStop;
    private RuleJudgment regularTakeProfit;
    private RuleJudgment strongTakeProfit;

    public RuleJudgment getShortStop() { return shortStop; }
    public void setShortStop(RuleJudgment shortStop) { this.shortStop = shortStop; }
    public RuleJudgment getTrendStop() { return trendStop; }
    public void setTrendStop(RuleJudgment trendStop) { this.trendStop = trendStop; }
    public RuleJudgment getRegularTakeProfit() { return regularTakeProfit; }
    public void setRegularTakeProfit(RuleJudgment regularTakeProfit) { this.regularTakeProfit = regularTakeProfit; }
    public RuleJudgment getStrongTakeProfit() { return strongTakeProfit; }
    public void setStrongTakeProfit(RuleJudgment strongTakeProfit) { this.strongTakeProfit = strongTakeProfit; }
    public List<RuleJudgment> getItems() { return Arrays.asList(shortStop, trendStop, regularTakeProfit, strongTakeProfit); }
}
