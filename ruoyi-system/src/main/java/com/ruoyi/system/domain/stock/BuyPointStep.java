package com.ruoyi.system.domain.stock;

import java.util.Arrays;
import java.util.List;

public class BuyPointStep
{
    private String status;
    private RuleJudgment goldenCross;
    private RuleJudgment retrace;
    private RuleJudgment convergence;

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public RuleJudgment getGoldenCross() { return goldenCross; }
    public void setGoldenCross(RuleJudgment goldenCross) { this.goldenCross = goldenCross; }
    public RuleJudgment getRetrace() { return retrace; }
    public void setRetrace(RuleJudgment retrace) { this.retrace = retrace; }
    public RuleJudgment getConvergence() { return convergence; }
    public void setConvergence(RuleJudgment convergence) { this.convergence = convergence; }
    public List<RuleJudgment> getItems() { return Arrays.asList(goldenCross, retrace, convergence); }
}
