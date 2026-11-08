package com.ruoyi.system.domain.report;

import java.util.List;

/** Only business fields are accepted; ownership and execution state are server controlled. */
public record ReportTaskInput(String title, String prompt, String scheduleType, String runAt,
        Integer hour, Integer minute, Integer weekDay, String requestKey, Integer version,
        List<Integer> weekDays, String workweek)
{
    /** Compatibility with existing callers and saved weekly tasks. */
    public ReportTaskInput(String title, String prompt, String scheduleType, String runAt,
            Integer hour, Integer minute, Integer weekDay, String requestKey, Integer version)
    { this(title,prompt,scheduleType,runAt,hour,minute,weekDay,requestKey,version,null,null); }
}
