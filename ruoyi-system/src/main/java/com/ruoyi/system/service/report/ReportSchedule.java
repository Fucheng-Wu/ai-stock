package com.ruoyi.system.service.report;

import java.time.*;
import java.time.format.DateTimeParseException;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.system.domain.report.ReportTaskInput;

public final class ReportSchedule
{
    public static final ZoneId ZONE = ZoneId.of("Asia/Shanghai");
    private ReportSchedule() {}

    public static long next(ReportTaskInput input, long after)
    {
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
        if (!"daily".equals(input.scheduleType()) && !"weekly".equals(input.scheduleType()))
            throw new ServiceException("任务频率仅支持once、daily、weekly");
        if (input.hour() == null || input.hour() < 0 || input.hour() > 23
            || input.minute() == null || input.minute() < 0 || input.minute() > 59)
            throw new ServiceException("请提供有效的小时和分钟");
        ZonedDateTime now = Instant.ofEpochMilli(after).atZone(ZONE);
        ZonedDateTime candidate = now.toLocalDate().atTime(input.hour(), input.minute()).atZone(ZONE);
        if ("weekly".equals(input.scheduleType()))
        {
            if (input.weekDay() == null || input.weekDay() < 1 || input.weekDay() > 7)
                throw new ServiceException("每周任务需指定星期一至星期日（1至7）");
            candidate = candidate.plusDays(Math.floorMod(input.weekDay() - candidate.getDayOfWeek().getValue(), 7));
            if (!candidate.isAfter(now)) candidate = candidate.plusWeeks(1);
        }
        else if (!candidate.isAfter(now)) candidate = candidate.plusDays(1);
        return candidate.toInstant().toEpochMilli();
    }
}
