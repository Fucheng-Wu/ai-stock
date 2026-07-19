package com.ruoyi.system.domain.stock;

public class AnalysisSignal
{
    private String type;
    private String description;
    private String confidence;
    private String reason;
    private String suggestedPosition;

    public AnalysisSignal() {}

    public AnalysisSignal(String type, String description, String confidence, String reason, String suggestedPosition)
    {
        this.type = type;
        this.description = description;
        this.confidence = confidence;
        this.reason = reason;
        this.suggestedPosition = suggestedPosition;
    }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getConfidence() { return confidence; }
    public void setConfidence(String confidence) { this.confidence = confidence; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getSuggestedPosition() { return suggestedPosition; }
    public void setSuggestedPosition(String suggestedPosition) { this.suggestedPosition = suggestedPosition; }
}
