package com.ruoyi.system.service.support;

import java.time.LocalDate;
import java.util.List;

public interface StockMarketSource
{
    record Security(String symbol, String name, String exchange) { }
    record Bar(LocalDate date, double rawOpen, double rawHigh, double rawLow, double rawClose,
               double qfqOpen, double qfqHigh, double qfqLow, double qfqClose, long volumeShares) { }
    List<Security> universe();
    List<Bar> history(String symbol, LocalDate target, int limit);
    boolean marketReady(LocalDate target);
}
