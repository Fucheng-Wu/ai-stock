package com.ruoyi.system.service.report;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.TimeZone;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.system.domain.report.ReportTaskInput;

class ReportScheduleTest
{
    @Test void jsonBusinessInputsBindNewFieldsAndExistingWeeklyPayloads() throws Exception
    {
        var mapper = tools.jackson.databind.json.JsonMapper.builder().build();
        var custom = mapper.readValue("{\"title\":\"报告\",\"prompt\":\"今日概况\",\"scheduleType\":\"custom\",\"hour\":9,\"minute\":0,\"weekDays\":[1,3,5]}",ReportTaskInput.class);
        assertEquals(List.of(1,3,5),custom.weekDays());
        var workweek = mapper.readValue("{\"title\":\"报告\",\"prompt\":\"今日概况\",\"scheduleType\":\"workweek\",\"hour\":9,\"minute\":0,\"workweek\":\"single\"}",ReportTaskInput.class);
        assertEquals("single",workweek.workweek());
        var weekly = mapper.readValue("{\"title\":\"报告\",\"prompt\":\"今日概况\",\"scheduleType\":\"weekly\",\"hour\":9,\"minute\":0,\"weekDay\":6}",ReportTaskInput.class);
        assertEquals(6,weekly.weekDay()); assertNull(weekly.weekDays());
    }
    private ReportTaskInput input(String type, String at, Integer hour, Integer minute, Integer day)
    { return new ReportTaskInput("报告","本周趋势",type,at,hour,minute,day,"test",1); }
    private long utc(String value) { return Instant.parse(value).toEpochMilli(); }
    private ReportTaskInput repeat(String type, List<Integer> days, String workweek)
    { return new ReportTaskInput("报告","今日市场",type,null,9,0,null,"test",1,days,workweek); }

    @Test void statutoryWorkdaysIncludeMakeupWeekendsAndSkipSpringFestival()
    {
        assertEquals(utc("2026-02-14T01:00:00Z"),ReportSchedule.next(repeat("workday",null,null),utc("2026-02-13T01:00:00Z")));
        assertEquals(utc("2026-02-24T01:00:00Z"),ReportSchedule.next(repeat("workday",null,null),utc("2026-02-14T01:00:00Z")));
        assertEquals(utc("2027-01-31T01:00:00Z"),ReportSchedule.next(repeat("workday",null,null),utc("2027-01-29T01:00:00Z")));
        assertEquals(utc("2027-02-14T01:00:00Z"),ReportSchedule.next(repeat("workday",null,null),utc("2027-02-04T01:00:00Z")));
        assertEquals(utc("2027-01-04T01:00:00Z"),ReportSchedule.next(repeat("workday",null,null),utc("2026-12-31T01:00:00Z")));
    }
    @Test void holidaysIncludeOrdinaryWeekendsButExcludeMakeupWorkdays()
    {
        assertEquals(utc("2026-01-10T01:00:00Z"),ReportSchedule.next(repeat("holiday",null,null),utc("2026-01-03T01:00:00Z")));
        assertEquals(utc("2026-02-15T01:00:00Z"),ReportSchedule.next(repeat("holiday",null,null),utc("2026-02-13T01:00:00Z")));
        assertEquals(utc("2027-02-20T01:00:00Z"),ReportSchedule.next(repeat("holiday",null,null),utc("2027-02-13T01:00:00Z")));
        assertEquals(utc("2027-06-09T01:00:00Z"),ReportSchedule.next(repeat("holiday",null,null),utc("2027-06-08T01:00:00Z")));
    }
    @Test void publishedCalendarsPartitionEveryDateAndNeverGuessUnknownYears()
    {
        assertEquals(List.of(2026,2027),ReportHolidayCalendar.years());
        for (int year : ReportHolidayCalendar.years())
        {
            int workdays = 0;
            for (LocalDate day = LocalDate.of(year,1,1); day.getYear() == year; day = day.plusDays(1))
                if (ReportHolidayCalendar.isWorkday(day)) workdays++;
            assertTrue(workdays > 240 && workdays < 255);
        }
        assertThrows(ReportHolidayCalendar.MissingYearException.class,() -> ReportSchedule.next(repeat("workday",null,null),utc("2027-12-31T01:00:00Z")));
        assertThrows(ReportHolidayCalendar.MissingYearException.class,() -> ReportSchedule.next(repeat("holiday",null,null),utc("2028-01-01T00:00:00Z")));
        assertEquals(utc("2028-01-03T01:00:00Z"),ReportSchedule.next(repeat("custom",List.of(1),null),utc("2027-12-31T01:00:00Z")));
    }
    @Test void fixedWorkweeksAndCustomDaysIgnoreHolidayAdjustments()
    {
        long friday = utc("2026-02-13T01:00:00Z");
        assertEquals(utc("2026-02-14T01:00:00Z"),ReportSchedule.next(repeat("workweek",null,"single"),friday));
        assertEquals(utc("2026-02-16T01:00:00Z"),ReportSchedule.next(repeat("workweek",null,"double"),friday));
        ReportTaskInput custom = repeat("custom",List.of(5,1,3),null);
        assertEquals(List.of(1,3,5),ReportSchedule.normalize(custom).weekDays());
        assertEquals(utc("2026-11-06T01:00:00Z"),ReportSchedule.next(custom,utc("2026-11-04T01:00:00Z")));
        assertEquals(utc("2026-11-09T01:00:00Z"),ReportSchedule.next(custom,utc("2026-11-06T01:00:00Z")));
        for (List<Integer> days : List.of(List.<Integer>of(),List.of(0),List.of(8),List.of(1,1)))
            assertThrows(ServiceException.class,() -> ReportSchedule.next(repeat("custom",days,null),friday));
        for (String mode : new String[]{null,"alternating",""})
            assertThrows(ServiceException.class,() -> ReportSchedule.next(repeat("workweek",null,mode),friday));
        assertThrows(ServiceException.class,() -> ReportSchedule.next(repeat("custom",null,null),friday));
    }

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
