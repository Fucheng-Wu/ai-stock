package com.ruoyi.system.service.report;

import java.time.Instant;
import java.util.TimeZone;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.system.domain.report.ReportTaskInput;

class ReportScheduleTest
{
    private ReportTaskInput input(String type, String at, Integer hour, Integer minute, Integer day)
    { return new ReportTaskInput("报告","本周趋势",type,at,hour,minute,day,"test",1); }
    private long utc(String value) { return Instant.parse(value).toEpochMilli(); }

    @Test void saturdayAtNineUsesShanghaiRegardlessOfServerZone()
    {
        TimeZone previous=TimeZone.getDefault();
        try
        {
            TimeZone.setDefault(TimeZone.getTimeZone("America/Los_Angeles"));
            assertEquals(utc("2026-11-07T01:00:00Z"),ReportSchedule.next(input("weekly",null,9,0,6),utc("2026-11-05T04:00:00Z")));
            assertEquals(utc("2026-11-14T01:00:00Z"),ReportSchedule.next(input("weekly",null,9,0,6),utc("2026-11-07T01:00:00Z")));
        }
        finally { TimeZone.setDefault(previous); }
    }
    @Test void dailySkipsMissedOccurrencesAndRollsAcrossYearBoundary()
    {
        assertEquals(utc("2027-01-01T08:00:00Z"),ReportSchedule.next(input("daily",null,16,0,null),utc("2026-12-31T08:00:00Z")));
        assertEquals(utc("2026-11-05T08:00:00Z"),ReportSchedule.next(input("daily",null,16,0,null),utc("2026-11-05T07:59:59Z")));
    }
    @Test void oneOffTimesAreExplicitFutureShanghaiDates()
    {
        assertEquals(utc("2026-11-05T08:00:00Z"),ReportSchedule.next(input("once","2026-11-05T16:00:00",null,null,null),utc("2026-11-05T07:00:00Z")));
        for (String value:new String[]{"2026-11-05T15:00:00","2026-02-30T16:00:00","2026-11-06T16:00:00Z","2026-11-06T16:00:00+08:00","invalid"})
            assertThrows(ServiceException.class,()->ReportSchedule.next(input("once",value,null,null,null),utc("2026-11-05T07:00:00Z")));
    }
    @Test void rejectsUnsupportedOrIncompleteRules()
    {
        for (ReportTaskInput rule:new ReportTaskInput[]{input("cron",null,9,0,null),input("weekly",null,9,0,null),input("weekly",null,9,0,0),input("weekly",null,9,0,8),input("daily",null,24,0,null),input("daily",null,9,60,null),input("daily",null,null,0,null)})
            assertThrows(ServiceException.class,()->ReportSchedule.next(rule,utc("2026-11-05T04:00:00Z")));
    }
}
