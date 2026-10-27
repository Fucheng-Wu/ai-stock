package com.ruoyi.quartz;

import static org.junit.jupiter.api.Assertions.*;
import java.time.ZoneId;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.quartz.*;
import org.quartz.impl.StdSchedulerFactory;
import com.ruoyi.quartz.domain.SysJob;
import com.ruoyi.quartz.util.ScheduleUtils;

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
            for (int hour:List.of(16,17))
            {
                SysJob job=new SysJob(); job.setJobId((long)hour); job.setJobGroup("DEFAULT"); job.setJobName("stock-test");
                job.setInvokeTarget("stockMarketTask.syncDaily()"); job.setCronExpression("0 0 "+hour+" * * ?"); job.setTimeZone("Asia/Shanghai");
                job.setStatus("1"); job.setConcurrent("1"); job.setMisfirePolicy("3"); ScheduleUtils.createScheduleJob(scheduler,job);
                CronTrigger trigger=(CronTrigger)scheduler.getTrigger(ScheduleUtils.getTriggerKey((long)hour,"DEFAULT"));
                assertEquals("Asia/Shanghai",trigger.getTimeZone().getID());
                assertEquals(hour,trigger.getNextFireTime().toInstant().atZone(ZoneId.of("Asia/Shanghai")).getHour());
            }
        }
        finally { if(scheduler!=null)scheduler.shutdown(); TimeZone.setDefault(original); }
    }
}
