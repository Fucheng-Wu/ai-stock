package com.ruoyi.system.domain.report;

/** Only business fields are accepted; ownership and execution state are server controlled. */
public record ReportTaskInput(String title, String prompt, String scheduleType, String runAt,
        Integer hour, Integer minute, Integer weekDay, String requestKey, Integer version) {}
