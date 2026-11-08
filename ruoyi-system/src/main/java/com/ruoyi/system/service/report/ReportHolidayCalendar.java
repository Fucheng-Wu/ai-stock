package com.ruoyi.system.service.report;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;

/** Published mainland China holiday arrangements. Unknown years must never use a guessed calendar. */
public final class ReportHolidayCalendar
{
    private record Year(Set<LocalDate> holidays, Set<LocalDate> workdays) {}
    private static final Map<Integer,Year> YEARS = load();
    private ReportHolidayCalendar() {}

    public static final class MissingYearException extends RuntimeException
    {
        public MissingYearException(int year) { super(year + "年节假日与调休日历尚未配置，任务已保存，待日历更新后继续调度"); }
    }

    public static List<Integer> years() { return YEARS.keySet().stream().sorted().toList(); }

    public static boolean isWorkday(LocalDate date)
    {
        Year year = YEARS.get(date.getYear());
        if (year == null) throw new MissingYearException(date.getYear());
        if (year.workdays().contains(date)) return true;
        return !year.holidays().contains(date) && date.getDayOfWeek().getValue() <= 5;
    }

    private static Map<Integer,Year> load()
    {
        try (InputStream stream = ReportHolidayCalendar.class.getResourceAsStream("/report-calendar/china-holidays.json"))
        {
            if (stream == null) throw new IllegalStateException("报告节假日日历资源缺失");
            JSONObject root = JSON.parseObject(new String(stream.readAllBytes(), StandardCharsets.UTF_8));
            Map<Integer,Year> result = new HashMap<>();
            for (String key : root.keySet())
            {
                int year = Integer.parseInt(key);
                JSONObject data = root.getJSONObject(key);
                if (data.getString("source") == null) throw new IllegalStateException("日历缺少官方来源");
                Set<LocalDate> holidays = new HashSet<>(), workdays = new HashSet<>();
                for (String range : data.getList("holidays", String.class))
                {
                    String[] ends = range.split("/");
                    LocalDate start = LocalDate.parse(ends[0]), end = LocalDate.parse(ends[ends.length - 1]);
                    if (ends.length > 2 || start.getYear() != year || end.getYear() != year || end.isBefore(start))
                        throw new IllegalStateException("节假日范围无效");
                    for (LocalDate day = start; !day.isAfter(end); day = day.plusDays(1)) holidays.add(day);
                }
                for (String value : data.getList("workdays", String.class))
                {
                    LocalDate day = LocalDate.parse(value);
                    if (day.getYear() != year || holidays.contains(day)) throw new IllegalStateException("补班日无效");
                    workdays.add(day);
                }
                result.put(year, new Year(Set.copyOf(holidays), Set.copyOf(workdays)));
            }
            return Map.copyOf(result);
        }
        catch (Exception e) { throw new IllegalStateException("加载报告节假日日历失败", e); }
    }
}
