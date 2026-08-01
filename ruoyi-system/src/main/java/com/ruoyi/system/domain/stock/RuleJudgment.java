package com.ruoyi.system.domain.stock;

import java.util.ArrayList;
import java.util.List;

public class RuleJudgment
{
    private String code;
    private String name;
    private String status;
    private List<RuleEvidence> evidence = new ArrayList<>();
    private String conclusion;
    private String reason;

    public RuleJudgment() { }

    public RuleJudgment(String code, String name) { this.code = code; this.name = name; }

    public RuleJudgment add(RuleEvidence item) { evidence.add(item); return this; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public List<RuleEvidence> getEvidence() { return evidence; }
    public void setEvidence(List<RuleEvidence> evidence) { this.evidence = evidence; }
    public String getConclusion() { return conclusion; }
    public void setConclusion(String conclusion) { this.conclusion = conclusion; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
}
