package com.ruoyi.system.service.report;

import java.util.*;
import java.time.Clock;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.dao.PessimisticLockingFailureException;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.system.domain.report.ReportTaskInput;

/** MySQL is the queue and source of truth. Row locks serialize edits and claims across gateways. */
@Service
public class AgentReportService
{
    private static final String TASK_FIELDS = "task_id AS taskId,title,prompt,schedule_type AS scheduleType,run_at AS runAt,"
        + "hour,minute,week_day AS weekDay,week_days AS weekDays,workweek,schedule_message AS scheduleMessage,"
        + "status,next_run_at AS nextRunAt,version,created_at AS createdAt,updated_at AS updatedAt";
    private static final String RUN_FIELDS = "run_id AS runId,task_id AS taskId,title,schedule_type AS scheduleType,"
        + "trigger_type AS triggerType,status,scheduled_at AS scheduledAt,started_at AS startedAt,finished_at AS finishedAt,error";
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final TransactionTemplate claimTx;
    private final Clock clock;
    @Value("${agent.report-worker-key:}") private String workerKey;
    private final AtomicLong lastWorkerContact = new AtomicLong();

    public void workerContact() { lastWorkerContact.set(clock.millis()); }
    public Map<String,Object> health()
    { return Map.of("configured",workerKey != null && workerKey.length() >= 32,"lastSeenAt",lastWorkerContact.get(),"timeZone","Asia/Shanghai","calendarYears",ReportHolidayCalendar.years()); }

    private void requireWorker()
    { if (workerKey == null || workerKey.length() < 32) throw new ServiceException("报告执行器尚未配置，请管理员设置AGENT_REPORT_WORKER_KEY后重试"); }

    @Autowired
    public AgentReportService(JdbcTemplate jdbc) { this(jdbc,Clock.systemUTC()); }

    AgentReportService(JdbcTemplate jdbc, Clock clock)
    {
        this.jdbc = jdbc;
        this.clock = clock;
        this.tx = new TransactionTemplate(new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource())));
        this.claimTx = new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
        // Avoid queue range/gap locks at MySQL's default REPEATABLE READ level.
        this.claimTx.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    }

    public Map<String,Object> tasks(Long userId, String kind, String keyword, int page, int size)
    {
        Map<String,Object> result = page("agent_report_task", TASK_FIELDS, userId, kind, keyword, page, size, "deleted=0", "created_at DESC,task_id DESC");
        @SuppressWarnings("unchecked") List<Map<String,Object>> rows = (List<Map<String,Object>>)result.get("rows");
        rows.forEach(this::withExecutionState);
        return result;
    }

    public Map<String,Object> reports(Long userId, String kind, String keyword, int page, int size)
    { return page("agent_report_run", RUN_FIELDS, userId, kind, keyword, page, size, "deleted=0", "scheduled_at DESC,run_id DESC"); }

    private Map<String,Object> page(String table, String fields, Long userId, String kind, String keyword,
            int page, int size, String extra, String order)
    {
        if (page < 1 || page > 10000 || size < 1 || size > 50) throw new ServiceException("分页范围无效，每页最多50条");
        if (keyword == null) keyword = "";
        if (keyword.length() > 100) throw new ServiceException("搜索内容最多100字符");
        String where = "user_id=? AND " + extra;
        List<Object> args = new ArrayList<>(); args.add(userId);
        if ("once".equals(kind)) where += " AND schedule_type='once'";
        else if ("recurring".equals(kind)) where += " AND schedule_type<>'once'";
        else if (kind != null && !kind.isEmpty() && !"all".equals(kind)) throw new ServiceException("报告分类无效");
        if (!keyword.isBlank()) { where += " AND title LIKE ? ESCAPE '!'"; args.add("%" + keyword.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%"); }
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE " + where, Long.class, args.toArray());
        args.add(size); args.add((page - 1) * size);
        return Map.of("rows", jdbc.queryForList("SELECT " + fields + " FROM " + table + " WHERE " + where + " ORDER BY " + order + " LIMIT ? OFFSET ?", args.toArray()),
            "total", count == null ? 0 : count, "page", page, "pageSize", size);
    }

    public Map<String,Object> task(Long userId, String id)
    { return withExecutionState(one("SELECT " + TASK_FIELDS + " FROM agent_report_task WHERE user_id=? AND task_id=? AND deleted=0", userId, id)); }

    /** Readiness is live executor health, separate from the user's saved schedule and pause state. */
    private Map<String,Object> withExecutionState(Map<String,Object> task)
    {
        task.put("weekDays",decodeDays(task.get("weekDays")));
        boolean configured = workerKey != null && workerKey.length() >= 32;
        boolean ready = configured && lastWorkerContact.get() > clock.millis() - 120_000;
        task.put("executionReady",ready);
        task.put("executionMessage",ready ? "报告执行器在线" : configured
            ? "报告执行器尚未连接，暂不能确认按时执行，请管理员检查服务"
            : "报告执行器尚未配置，暂不能执行，请联系管理员");
        return task;
    }

    public Map<String,Object> report(Long userId, String id)
    { return one("SELECT " + RUN_FIELDS + ",prompt,content FROM agent_report_run WHERE user_id=? AND run_id=? AND deleted=0", userId, id); }

    private Map<String,Object> one(String sql, Object... args)
    {
        List<Map<String,Object>> rows = jdbc.queryForList(sql, args);
        if (rows.isEmpty()) throw new ServiceException("记录不存在或无权访问");
        return rows.get(0);
    }

    public Map<String,Object> create(Long userId, ReportTaskInput raw)
    {
        ReportTaskInput input = ReportSchedule.normalize(raw);
        validate(input);
        requireKey(input.requestKey());
        return tx.execute(status -> {
            // Lock the owner row as well: the quota and idempotency check must be atomic.
            jdbc.queryForList("SELECT user_id FROM sys_user WHERE user_id=? FOR UPDATE", userId);
            List<Map<String,Object>> existing = jdbc.queryForList("SELECT * FROM agent_report_task WHERE user_id=? AND request_key=?", userId, input.requestKey());
            if (!existing.isEmpty())
            {
                Map<String,Object> row = existing.get(0);
                ReportTaskInput original = ReportSchedule.normalize(fromRow(row));
                if (!Objects.equals(original.title(),input.title().trim()) || !Objects.equals(original.prompt(),input.prompt().trim())
                    || !Objects.equals(original.scheduleType(),input.scheduleType()) || !Objects.equals(original.runAt(),input.runAt())
                    || !Objects.equals(original.hour(),input.hour()) || !Objects.equals(original.minute(),input.minute()) || !Objects.equals(original.weekDay(),input.weekDay())
                    || !Objects.equals(original.weekDays(),input.weekDays()) || !Objects.equals(original.workweek(),input.workweek()))
                    throw new ServiceException("该请求已创建过不同内容的任务，请先查询报告中心核实后再新建");
                return task(userId, String.valueOf(row.get("task_id")));
            }
            if (jdbc.queryForObject("SELECT COUNT(*) FROM agent_report_task WHERE user_id=? AND deleted=0", Long.class, userId) >= 100)
                throw new ServiceException("每个用户最多保留100个任务，请先删除不需要的任务");
            long now = clock.millis(); Plan plan = plan(input, now);
            String id = UUID.randomUUID().toString();
            jdbc.update("INSERT INTO agent_report_task(task_id,user_id,title,prompt,schedule_type,run_at,hour,minute,week_day,week_days,workweek,schedule_message,status,next_run_at,request_key,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'enabled',?,?,?,?)",
                id,userId,input.title().trim(),input.prompt().trim(),input.scheduleType(),input.runAt(),input.hour(),input.minute(),input.weekDay(),encodeDays(input.weekDays()),input.workweek(),plan.message(),plan.next(),input.requestKey(),now,now);
            return task(userId,id);
        });
    }

    public Map<String,Object> update(Long userId, String id, ReportTaskInput raw)
    {
        ReportTaskInput input = ReportSchedule.normalize(raw);
        validate(input);
        return tx.execute(status -> {
            Map<String,Object> old = lockTask(userId,id);
            if (input.version() == null || ((Number) old.get("version")).intValue() != input.version())
                throw new ServiceException("任务已发生变化，请重新查询后再修改");
            long now = clock.millis(); Plan plan = plan(input,now);
            jdbc.update("UPDATE agent_report_task SET title=?,prompt=?,schedule_type=?,run_at=?,hour=?,minute=?,week_day=?,week_days=?,workweek=?,schedule_message=?,next_run_at=?,status=CASE WHEN status='paused' THEN 'paused' ELSE 'enabled' END,version=version+1,updated_at=? WHERE task_id=? AND user_id=?",
                input.title().trim(),input.prompt().trim(),input.scheduleType(),input.runAt(),input.hour(),input.minute(),input.weekDay(),encodeDays(input.weekDays()),input.workweek(),plan.message(),plan.next(),now,id,userId);
            return task(userId,id);
        });
    }

    public Map<String,Object> setStatus(Long userId, String id, String action, int version)
    {
        if (!Set.of("pause","resume").contains(action)) throw new ServiceException("任务操作无效");
        return tx.execute(status -> {
            Map<String,Object> row = lockTask(userId,id);
            if (((Number) row.get("version")).intValue() != version) throw new ServiceException("任务已变化，请刷新");
            long now = clock.millis();
            Plan plan = "resume".equals(action) ? plan(fromRow(row), now) : new Plan(null,null);
            jdbc.update("UPDATE agent_report_task SET status=?,next_run_at=?,schedule_message=?,version=version+1,updated_at=? WHERE task_id=? AND user_id=?",
                "resume".equals(action) ? "enabled" : "paused",plan.next(),plan.message(),now,id,userId);
            if ("pause".equals(action)) cancelRuns(id,now);
            return task(userId,id);
        });
    }

    public void deleteTask(Long userId, String id, int version)
    {
        tx.executeWithoutResult(status -> {
            Map<String,Object> row = lockTask(userId,id);
            if (((Number) row.get("version")).intValue() != version) throw new ServiceException("任务已变化，请刷新后删除");
            long now = clock.millis();
            jdbc.update("UPDATE agent_report_task SET deleted=1,next_run_at=NULL,version=version+1,updated_at=? WHERE task_id=? AND user_id=?",now,id,userId);
            cancelRuns(id,now);
        });
    }

    private void cancelRuns(String id, long now)
    { jdbc.update("UPDATE agent_report_run SET status='cancelled',finished_at=?,error='任务已暂停或删除' WHERE task_id=? AND status IN ('queued','running')",now,id); }

    public void deleteReport(Long userId, String id)
    {
        if (jdbc.update("UPDATE agent_report_run SET deleted=1 WHERE user_id=? AND run_id=? AND status IN ('succeeded','failed','cancelled') AND deleted=0",userId,id) != 1)
            throw new ServiceException("报告不存在、无权访问或仍在执行中");
    }

    public Map<String,Object> runNow(Long userId, String id, String requestKey)
    {
        requireWorker();
        requireKey(requestKey);
        return tx.execute(status -> {
            Map<String,Object> task = lockTask(userId,id);
            if ("paused".equals(task.get("status"))) throw new ServiceException("请先恢复任务");
            List<Map<String,Object>> old = jdbc.queryForList("SELECT run_id,task_id FROM agent_report_run WHERE user_id=? AND request_key=?",userId,requestKey);
            if (!old.isEmpty())
            {
                if (!id.equals(old.get(0).get("task_id"))) throw new ServiceException("该执行请求已用于其他任务，请先查询核实");
                return report(userId,String.valueOf(old.get(0).get("run_id")));
            }
            if (jdbc.queryForObject("SELECT COUNT(*) FROM agent_report_run WHERE task_id=? AND status IN ('queued','running')",Long.class,id) > 0)
                throw new ServiceException("该任务已有待执行或正在执行的报告");
            return report(userId,insertRun(task,clock.millis(),"manual",requestKey));
        });
    }

    private String insertRun(Map<String,Object> task, long at, String trigger, String requestKey)
    {
        String id = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO agent_report_run(run_id,task_id,user_id,title,prompt,schedule_type,trigger_type,scheduled_at,status,request_key) VALUES(?,?,?,?,?,?,?,?,'queued',?)",
            id,task.get("task_id"),task.get("user_id"),task.get("title"),task.get("prompt"),task.get("schedule_type"),trigger,at,requestKey);
        return id;
    }

    /** One claim per worker; overdue recurring slots coalesce into one run, without replaying every missed slot. */
    public Map<String,Object> claim()
    {
        for (int attempt = 0; ; attempt++)
        {
            try { return claimOnce(); }
            catch (PessimisticLockingFailureException contention)
            {
                // A failed transaction has fully rolled back; no model work has started.
                if (attempt >= 2) throw contention;
            }
        }
    }

    private Map<String,Object> claimOnce()
    {
        return claimTx.execute(status -> {
            long now = clock.millis();
            jdbc.update("UPDATE agent_report_run SET status='failed',finished_at=?,error='执行超时或网关中断；请检查后手动重跑' WHERE status='running' AND deadline<?",now,now);
            // Plain FOR UPDATE works on MySQL 5.7 and 8.0. Locks are released when this short
            // transaction commits, before the worker starts generating the report.
            // After a calendar update/restart, waiting tasks resume without being recreated.
            List<Map<String,Object>> waiting = jdbc.queryForList("SELECT * FROM agent_report_task WHERE deleted=0 AND status='enabled' AND next_run_at IS NULL AND schedule_message IS NOT NULL ORDER BY updated_at,task_id LIMIT 10 FOR UPDATE");
            for (Map<String,Object> row : waiting)
            {
                Plan plan = plan(fromRow(row),now);
                jdbc.update("UPDATE agent_report_task SET next_run_at=?,schedule_message=?,updated_at=?,version=version+? WHERE task_id=?",
                    plan.next(),plan.message(),now,plan.next() == null ? 0 : 1,row.get("task_id"));
            }
            List<Map<String,Object>> due = jdbc.queryForList("SELECT * FROM agent_report_task t WHERE deleted=0 AND status='enabled' AND next_run_at<=? AND NOT EXISTS (SELECT 1 FROM agent_report_run r WHERE r.task_id=t.task_id AND r.status IN ('queued','running')) ORDER BY next_run_at,task_id LIMIT 1 FOR UPDATE",now);
            if (!due.isEmpty())
            {
                Map<String,Object> row = due.get(0);
                long at = ((Number) row.get("next_run_at")).longValue();
                insertRun(row,at,"scheduled",null);
                boolean once = "once".equals(row.get("schedule_type"));
                Plan plan = once ? new Plan(null,null) : plan(fromRow(row),now);
                jdbc.update("UPDATE agent_report_task SET next_run_at=?,schedule_message=?,status=?,version=version+1,updated_at=? WHERE task_id=?",
                    plan.next(),plan.message(),once ? "completed" : "enabled",now,row.get("task_id"));
            }
            List<Map<String,Object>> queued = jdbc.queryForList("SELECT * FROM agent_report_run WHERE status='queued' ORDER BY scheduled_at,run_id LIMIT 1 FOR UPDATE");
            if (queued.isEmpty()) return null;
            Map<String,Object> run = queued.get(0);
            String lease = UUID.randomUUID().toString();
            if (jdbc.update("UPDATE agent_report_run SET status='running',started_at=?,deadline=?,lease_token=? WHERE run_id=? AND status='queued'",now,now+600_000,lease,run.get("run_id")) != 1) return null;
            return Map.of("runId",run.get("run_id"),"leaseToken",lease,"title",run.get("title"),"prompt",run.get("prompt"),"scheduledAt",run.get("scheduled_at"));
        });
    }

    /** The worker never supplies a user ID; identity comes from this execution row. */
    public Long workerOwner(String runId, String lease)
    {
        Map<String,Object> row = one("SELECT r.user_id FROM agent_report_run r JOIN agent_report_task t ON t.task_id=r.task_id WHERE r.run_id=? AND r.lease_token=? AND r.status='running' AND r.deadline>? AND t.deleted=0 AND t.status<>'paused'",
            runId,lease,clock.millis());
        return ((Number) row.get("user_id")).longValue();
    }

    public void finish(String runId, String lease, String content, String error)
    {
        workerOwner(runId,lease);
        if (content != null && content.length() > 200_000) throw new ServiceException("报告超过20万字符");
        if (error != null && error.length() > 1000) error = error.substring(0,1000);
        if (error == null && (content == null || content.isBlank())) throw new ServiceException("报告正文不能为空");
        if (jdbc.update("UPDATE agent_report_run SET status=?,content=?,error=?,finished_at=? WHERE run_id=? AND lease_token=? AND status='running' AND deadline>?",
            error == null ? "succeeded" : "failed",error == null ? content : null,error,clock.millis(),runId,lease,clock.millis()) != 1)
            throw new ServiceException("执行已过期或取消");
    }

    private Map<String,Object> lockTask(Long userId, String id)
    { return one("SELECT * FROM agent_report_task WHERE user_id=? AND task_id=? AND deleted=0 FOR UPDATE",userId,id); }

    private static ReportTaskInput fromRow(Map<String,Object> row)
    { return new ReportTaskInput((String)row.get("title"),(String)row.get("prompt"),(String)row.get("schedule_type"),(String)row.get("run_at"),number(row.get("hour")),number(row.get("minute")),number(row.get("week_day")),null,null,decodeDays(row.get("week_days")),(String)row.get("workweek")); }
    private record Plan(Long next, String message) {}
    private static Plan plan(ReportTaskInput input, long now)
    {
        try { return new Plan(ReportSchedule.next(input,now),null); }
        catch (ReportHolidayCalendar.MissingYearException missing) { return new Plan(null,missing.getMessage()); }
    }
    private static String encodeDays(List<Integer> days)
    { return days == null ? null : String.join(",",days.stream().map(String::valueOf).toList()); }
    private static List<Integer> decodeDays(Object value)
    { return value == null ? null : Arrays.stream(value.toString().split(",")).map(Integer::valueOf).toList(); }
    private static Integer number(Object value) { return value == null ? null : ((Number)value).intValue(); }
    private static void requireKey(String key)
    { if (key == null || !key.matches("[A-Za-z0-9_:-]{1,128}")) throw new ServiceException("缺少有效的请求标识"); }
    private static void validate(ReportTaskInput input)
    {
        if (input == null || input.title() == null || input.title().isBlank() || input.title().length() > 100)
            throw new ServiceException("任务标题需为1至100字符");
        if (input.prompt() == null || input.prompt().isBlank() || input.prompt().length() > 5000)
            throw new ServiceException("报告要求需为1至5000字符");
    }
}
