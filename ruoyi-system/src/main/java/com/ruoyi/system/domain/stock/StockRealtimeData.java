package com.ruoyi.system.domain.stock;

public class StockRealtimeData
{
    private String code;
    private String name;
    private double openPrice;
    private double prevClose;
    private double currentPrice;
    private double high;
    private double low;
    private long volume;
    private double amount;
    private String date;
    private String time;
    private Double ma5;
    private Double ma20;
    private Double ma5Prev;
    private Double ma20Prev;

    public double getChangePct()
    {
        if (prevClose == 0) return 0;
        return Math.round((currentPrice - prevClose) / prevClose * 10000.0) / 100.0;
    }

    public double getChangeAmt()
    {
        return Math.round((currentPrice - prevClose) * 100.0) / 100.0;
    }

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public double getOpenPrice() { return openPrice; }
    public void setOpenPrice(double openPrice) { this.openPrice = openPrice; }
    public double getPrevClose() { return prevClose; }
    public void setPrevClose(double prevClose) { this.prevClose = prevClose; }
    public double getCurrentPrice() { return currentPrice; }
    public void setCurrentPrice(double currentPrice) { this.currentPrice = currentPrice; }
    public double getHigh() { return high; }
    public void setHigh(double high) { this.high = high; }
    public double getLow() { return low; }
    public void setLow(double low) { this.low = low; }
    public long getVolume() { return volume; }
    public void setVolume(long volume) { this.volume = volume; }
    public double getAmount() { return amount; }
    public void setAmount(double amount) { this.amount = amount; }
    public String getDate() { return date; }
    public void setDate(String date) { this.date = date; }
    public String getTime() { return time; }
    public void setTime(String time) { this.time = time; }
    public Double getMa5() { return ma5; }
    public void setMa5(Double ma5) { this.ma5 = ma5; }
    public Double getMa20() { return ma20; }
    public void setMa20(Double ma20) { this.ma20 = ma20; }
    public Double getMa5Prev() { return ma5Prev; }
    public void setMa5Prev(Double ma5Prev) { this.ma5Prev = ma5Prev; }
    public Double getMa20Prev() { return ma20Prev; }
    public void setMa20Prev(Double ma20Prev) { this.ma20Prev = ma20Prev; }
}
