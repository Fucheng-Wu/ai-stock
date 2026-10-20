package com.ruoyi.system.domain.stock;

/** 股票名称检索候选，code 始终包含市场前缀。 */
public class StockSearchResult
{
    private String code;
    private String name;
    private String market;
    private String securityType;
    private boolean exactMatch;

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getMarket() { return market; }
    public void setMarket(String market) { this.market = market; }
    public String getSecurityType() { return securityType; }
    public void setSecurityType(String securityType) { this.securityType = securityType; }
    public boolean isExactMatch() { return exactMatch; }
    public void setExactMatch(boolean exactMatch) { this.exactMatch = exactMatch; }
}
