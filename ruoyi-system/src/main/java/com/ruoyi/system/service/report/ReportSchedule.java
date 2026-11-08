package com.ruoyi.system.service.report;

import java.time.*;
import java.time.format.DateTimeParseException;
import java.util.*;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.system.domain.report.ReportTaskInput;

public final class ReportSchedule
{
    public static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private ReportSchedule() {}

    /** Clear irrelevant fields, sort custom days, and reject incomplete rules before persistence. */
    public static ReportTaskInput normalize(ReportTaskInput input)
    {
        if (input == null || input.scheduleType() == null
            || !Set.of("once","daily","weekly","workday","holiday","workweek","custom").contains(input.scheduleType()))
            throw new ServiceException("请选择仅一次、每天、法定工作日、节假日及周末、单双休工作日或自定义");
        String type = input.scheduleType();
        if (!"once".equals(type) && (input.hour() == null || input.hour() < 0 || input.hour() > 23
            || input.minute() == null || input.minute() < 0 || input.minute() > 59))
            throw new ServiceException("请提供有效的小时和分钟");
        if ("weekly".equals(type) && (input.weekDay() == null || input.weekDay() < 1 || input.weekDay() > 7))
            throw new ServiceException("每周任务需指定星期一至星期日（1至7）");
        List<Integer> days = null;
        if ("custom".equals(type))
        {
            days = input.weekDays();
            if (days == null || days.isEmpty() || days.size() > 7
                || days.stream().anyMatch(day -> day == null || day < 1 || day > 7)
                || new HashSet<>(days).size() != days.size())
                throw new ServiceException("自定义需选择不重复的星期，至少一天，范围1至7");
            days = days.stream().sorted().toList();
        }
        if ("workweek".equals(type) && !Set.of("single","double").contains(input.workweek() == null ? "" : input.workweek()))
            throw new ServiceException("单双休工作日需选择single（周一至周六）或double（周一至周五）");
        return new ReportTaskInput(input.title(),input.prompt(),type,"once".equals(type) ? input.runAt() : null,
            "once".equals(type) ? null : input.hour(),"once".equals(type) ? null : input.minute(),
            "weekly".equals(type) ? input.weekDay() : null,input.requestKey(),input.version(),days,
            "workweek".equals(type) ? input.workweek() : null);
    }

    public static long next(ReportTaskInput input, long after)
    {
        input = normalize(input);
        if ("once".equals(input.scheduleType()))
        {
            try
            {
                if (input.runAt() == null || !input.runAt().matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2})?"))
                    throw new ServiceException("一次性执行时间需为北京时间YYYY-MM-DDTHH:mm:ss，不带时区后缀");
                long at = LocalDateTime.parse(input.runAt()).atZone(ZONE).toInstant().toEpochMilli();
                if (at <= after) throw new ServiceException("一次性任务的执行时间必须晚于当前北京时间");
                return at;
            }
            catch (DateTimeParseException | NullPointerException e)
            { throw new ServiceException("请提供有效的北京时间，例如2026-11-05T16:00:00"); }
        }
        ZonedDateTime now = Instant.ofEpochMilli(after).atZone(ZONE);
        ZonedDateTime candidate = now.toLocalDate().atTime(input.hour(), input.minute()).atZone(ZONE);
        if (!candidate.isAfter(now)) candidate = candidate.plusDays(1);
        for (int offset = 0; offset < 370; offset++, candidate = candidate.plusDays(1))
        {
            int day = candidate.getDayOfWeek().getValue();
            boolean matches = switch (input.scheduleType()) {
                case "daily" -> true;
                case "weekly" -> day == input.weekDay();
                case "custom" -> input.weekDays().contains(day);
                case "workweek" -> day <= ("single".equals(input.workweek()) ? 6 : 5);
                case "workday" -> ReportHolidayCalendar.isWorkday(candidate.toLocalDate());
                case "holiday" -> !ReportHolidayCalendar.isWorkday(candidate.toLocalDate());
                default -> false;
            };
            if (matches) return candidate.toInstant().toEpochMilli();
        }
        throw new ServiceException("未找到下一次执行时间");
    }
}
