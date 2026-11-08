package com.ruoyi.quartz;

import static org.junit.jupiter.api.Assertions.*;
import java.time.ZoneId;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.quartz.*;
import org.quartz.impl.StdSchedulerFactory;
import com.ruoyi.quartz.domain.SysJob;
import com.ruoyi.quartz.util.ScheduleUtils;
import com.ruoyi.quartz.task.StockMarketTask;
import com.ruoyi.system.service.impl.StockMarketService;

class StockMarketTimezoneTest
{
    @Test void bothJobsUseShanghaiEvenWhenServerUsesUtc() throws Exception
    {
        TimeZone original=TimeZone.getDefault(); TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
        Scheduler scheduler=null;
        try
        {
            Properties properties=new Properties(); properties.setProperty("org.quartz.scheduler.instanceName","stock-timezone-test");
            properties.setProperty("org.quartz.threadPool.threadCount","1"); properties.setProperty("org.quartz.jobStore.class","org.quartz.simpl.RAMJobStore");
            scheduler=new StdSchedulerFactory(properties).getScheduler();
            for (int hour:List.of(21,23))
            {
                int minute = hour == 21 ? 30 : 0;
                SysJob job=new SysJob(); job.setJobId((long)hour); job.setJobGroup("DEFAULT"); job.setJobName("stock-test");
                job.setInvokeTarget(hour == 21 ? "stockMarketTask.syncDaily()" : "stockMarketTask.screenDaily()"); job.setCronExpression("0 "+minute+" "+hour+" * * ?"); job.setTimeZone("Asia/Shanghai");
                job.setStatus("1"); job.setConcurrent("1"); job.setMisfirePolicy("3"); ScheduleUtils.createScheduleJob(scheduler,job);
                CronTrigger trigger=(CronTrigger)scheduler.getTrigger(ScheduleUtils.getTriggerKey((long)hour,"DEFAULT"));
                assertEquals("Asia/Shanghai",trigger.getTimeZone().getID());
                assertEquals(hour,trigger.getNextFireTime().toInstant().atZone(ZoneId.of("Asia/Shanghai")).getHour());
                assertEquals(minute,trigger.getNextFireTime().toInstant().atZone(ZoneId.of("Asia/Shanghai")).getMinute());
            }
        }
        finally { if(scheduler!=null)scheduler.shutdown(); TimeZone.setDefault(original); }
    }
    @Test void recoveryEntryPointsUseTheSpecifiedDate() throws Exception
    {
        List<LocalDate> dates = new ArrayList<>();
        StockMarketService service = new StockMarketService(null,null,1)
        {
            @Override public void sync(LocalDate date) { dates.add(date); }
            @Override public String screen(LocalDate date) { dates.add(date); return "fixture"; }
        };
        StockMarketTask task = new StockMarketTask(service);
        task.syncDate("2026-11-06"); task.screenDate("2026-11-06");
        assertEquals(List.of(LocalDate.of(2026,11,6),LocalDate.of(2026,11,6)), dates);
        assertThrows(java.time.format.DateTimeParseException.class, () -> task.syncDate("2026-11-99"));
    }
}
