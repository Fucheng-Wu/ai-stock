package com.ruoyi.quartz.task;

import java.time.LocalDate;
import org.springframework.stereotype.Component;
import com.ruoyi.system.service.impl.StockMarketService;

@Component("stockMarketTask")
public class StockMarketTask
{
    private final StockMarketService service;
    public StockMarketTask(StockMarketService service) { this.service = service; }
    public void syncDaily() throws Exception { service.syncDaily(); }
    public void screenDaily() throws Exception { service.screenDaily(); }
    public void screenDate(String date) throws Exception { service.screen(LocalDate.parse(date)); }
}
