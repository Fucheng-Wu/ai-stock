package com.ruoyi.system.domain.stock;

public class StockKlineData
{
    private String date;
    private Double open;
    private Double close;
    private Double high;
    private Double low;
    private Double ma5;
    private Double ma10;
    private Double ma20;
    private long volume;

    public String getDate() { return date; }
    public void setDate(String date) { this.date = date; }
    public Double getOpen() { return open; }
    public void setOpen(Double open) { this.open = open; }
    public Double getClose() { return close; }
    public void setClose(Double close) { this.close = close; }
    public Double getHigh() { return high; }
    public void setHigh(Double high) { this.high = high; }
    public Double getLow() { return low; }
    public void setLow(Double low) { this.low = low; }
    public Double getMa5() { return ma5; }
    public void setMa5(Double ma5) { this.ma5 = ma5; }
    public Double getMa10() { return ma10; }
    public void setMa10(Double ma10) { this.ma10 = ma10; }
    public Double getMa20() { return ma20; }
    public void setMa20(Double ma20) { this.ma20 = ma20; }
    public long getVolume() { return volume; }
    public void setVolume(long volume) { this.volume = volume; }
}
