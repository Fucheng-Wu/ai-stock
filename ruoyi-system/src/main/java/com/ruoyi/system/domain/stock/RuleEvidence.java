package com.ruoyi.system.domain.stock;

public class RuleEvidence
{
    private String label;
    private Object value;
    private String displayValue;
    private String threshold;
    private String status;

    public RuleEvidence() { }

    public RuleEvidence(String label, Object value, String displayValue, String threshold, String status)
    {
        this.label = label;
        this.value = value;
        this.displayValue = displayValue;
        this.threshold = threshold;
        this.status = status;
    }

    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
    public Object getValue() { return value; }
    public void setValue(Object value) { this.value = value; }
    public String getDisplayValue() { return displayValue; }
    public void setDisplayValue(String displayValue) { this.displayValue = displayValue; }
    public String getThreshold() { return threshold; }
    public void setThreshold(String threshold) { this.threshold = threshold; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
