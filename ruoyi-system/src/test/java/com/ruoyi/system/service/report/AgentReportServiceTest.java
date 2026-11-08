package com.ruoyi.system.service.report;

import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import com.ruoyi.system.domain.report.ReportTaskInput;

class AgentReportServiceTest
{
    private JdbcTemplate jdbc;
    private AgentReportService service;
    protected DriverManagerDataSource dataSource()
    { return new DriverManagerDataSource("jdbc:h2:mem:reports_"+UUID.randomUUID()+";MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE;NON_KEYWORDS=HOUR,MINUTE","sa",""); }
    @BeforeEach void setup() throws Exception
    {
        jdbc=new JdbcTemplate(dataSource());
        jdbc.execute("CREATE TABLE sys_user(user_id bigint PRIMARY KEY)");
        jdbc.execute("INSERT INTO sys_user VALUES(42),(84)");
        Path root=Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (!Files.exists(root.resolve("sql/agent_reports.sql"))) root=root.getParent();
        String ddl=Files.readString(root.resolve("sql/agent_reports.sql")).split("INSERT INTO sys_menu")[0].replaceAll("(?m)^--.*$","");
        for (String statement:ddl.split(";")) if (!statement.isBlank()) jdbc.execute(statement);
        service=new AgentReportService(jdbc);
        var key=AgentReportService.class.getDeclaredField("workerKey"); key.setAccessible(true); key.set(service,"fixture-worker-key-01234567890123456789");
    }
    private ReportTaskInput input(String key, Integer version)
    { return new ReportTaskInput("市场周报","分析本周趋势并注明来源","weekly",null,9,0,6,key,version); }
    private String create(String key) { return String.valueOf(service.create(42L,input(key,null)).get("taskId")); }
    private void due(String id) { jdbc.update("UPDATE agent_report_task SET next_run_at=? WHERE task_id=?",System.currentTimeMillis()-86400000*9L,id); }
    @Test void legacyUnusedFieldsDoNotBreakIdempotentRetriesAfterUpgrade()
    {
        String at=Instant.ofEpochMilli(System.currentTimeMillis()+120000).atZone(ReportSchedule.ZONE).toLocalDateTime().withNano(0).toString();
        ReportTaskInput once = new ReportTaskInput("旧一次性任务","今日概况","once",at,9,0,6,"legacy-once",null);
        String id = (String)service.create(42L,once).get("taskId");
        // Previous UI sent and persisted daily/weekly fields even for a once task.
        jdbc.update("UPDATE agent_report_task SET hour=9,minute=0,week_day=6 WHERE task_id=?",id);
        assertEquals(id,service.create(42L,once).get("taskId"));
    }
    @Test void customWeekdaysAndWorkweekRoundTripAndParticipateInIdempotency()
    {
        ReportTaskInput custom = new ReportTaskInput("自定义报告","按星期复盘","custom",null,9,0,null,"custom-key",null,List.of(5,1,3),null);
        Map<String,Object> saved = service.create(42L,custom);
        String id = (String)saved.get("taskId");
        assertEquals(List.of(1,3,5),saved.get("weekDays"));
        assertEquals(id,service.create(42L,new ReportTaskInput("自定义报告","按星期复盘","custom",null,9,0,null,"custom-key",null,List.of(1,3,5),null)).get("taskId"));
        assertThrows(RuntimeException.class,() -> service.create(42L,new ReportTaskInput("自定义报告","按星期复盘","custom",null,9,0,null,"custom-key",null,List.of(1,5),null)));
        Map<String,Object> updated = service.update(42L,id,new ReportTaskInput("自定义报告","按星期复盘","workweek",null,9,0,null,null,1,null,"single"));
        assertEquals("single",updated.get("workweek")); assertNull(updated.get("weekDays"));
        due(id); assertNotNull(service.claim());
        assertNotNull(service.task(42L,id).get("nextRunAt"));
        String other = (String)service.create(42L,new ReportTaskInput("单休","按星期复盘","workweek",null,9,0,null,"workweek-key",null,null,"single")).get("taskId");
        assertThrows(RuntimeException.class,() -> service.create(42L,new ReportTaskInput("单休","按星期复盘","workweek",null,9,0,null,"workweek-key",null,null,"double")));
        assertEquals("single",service.task(42L,other).get("workweek"));
    }
    @Test void missingCalendarPreservesTasksAndNeverBlocksTheLastKnownOccurrenceOrOtherJobs()
    {
        service = new AgentReportService(jdbc,Clock.fixed(Instant.parse("2027-12-31T00:00:00Z"),ZoneOffset.UTC));
        Map<String,Object> saved = service.create(42L,new ReportTaskInput("工作日报","今日概况","workday",null,9,0,null,"last-calendar-day",null));
        String id = (String)saved.get("taskId");
        assertNotNull(saved.get("nextRunAt"));
        service = new AgentReportService(jdbc,Clock.fixed(Instant.parse("2027-12-31T01:00:01Z"),ZoneOffset.UTC));
        Map<String,Object> last = service.claim(); assertNotNull(last);
        Map<String,Object> waiting = service.task(42L,id);
        assertEquals("enabled",waiting.get("status")); assertNull(waiting.get("nextRunAt"));
        assertTrue(waiting.get("scheduleMessage").toString().contains("2028"));
        service.finish((String)last.get("runId"),(String)last.get("leaseToken"),"最后一个已配置工作日",null);
        assertNull(service.claim());
        assertEquals("succeeded",service.report(42L,(String)last.get("runId")).get("status"));
        Map<String,Object> newWaiting = service.create(42L,new ReportTaskInput("休息日报","今日概况","holiday",null,9,0,null,"unknown-calendar",null));
        assertNull(newWaiting.get("nextRunAt")); assertNotNull(newWaiting.get("scheduleMessage"));
        service.create(42L,new ReportTaskInput("每日正常","今日概况","daily",null,9,1,null,"normal-daily",null));
        jdbc.update("UPDATE agent_report_task SET next_run_at=? WHERE request_key='normal-daily'",Instant.parse("2027-12-31T01:00:00Z").toEpochMilli());
        assertNotNull(service.claim(),"calendar-waiting tasks cannot starve other jobs");
        // An updated calendar makes a pending task calculable again; no recreation required.
        jdbc.update("UPDATE agent_report_task SET schedule_message='等待日历更新',next_run_at=NULL WHERE task_id=?",id);
        service = new AgentReportService(jdbc,Clock.fixed(Instant.parse("2027-12-30T00:00:00Z"),ZoneOffset.UTC));
        service.claim();
        assertNotNull(service.task(42L,id).get("nextRunAt")); assertNull(service.task(42L,id).get("scheduleMessage"));
    }
    @Test void creatingWithoutWorkerConfigurationSavesOwnedTasksAndReportsLiveReadiness() throws Exception
    {
        var key=AgentReportService.class.getDeclaredField("workerKey"); key.setAccessible(true);
        for (String missingKey : new String[]{null,"","too-short"})
        {
            service=new AgentReportService(jdbc);
            key.set(service,missingKey);
            String request="without-key-"+UUID.randomUUID();
            Map<String,Object> saved=service.create(42L,input(request,null));
            String id=(String)saved.get("taskId");
            assertEquals("enabled",saved.get("status"));
            assertEquals(false,saved.get("executionReady"));
            assertTrue(saved.get("executionMessage").toString().contains("尚未配置"));
            assertEquals(id,service.create(42L,input(request,null)).get("taskId"),"repeating the saved request is idempotent");
            assertEquals(false,service.update(42L,id,input("ignored",1)).get("executionReady"));
            assertThrows(RuntimeException.class,()->service.task(84L,id));
            assertThrows(RuntimeException.class,()->service.runNow(42L,id,"manual-without-executor"),"immediate execution still requires the executor");
            key.set(service,"fixture-worker-key-01234567890123456789");
            assertEquals(false,service.task(42L,id).get("executionReady"),"configured but not connected is not ready");
            service.workerContact();
            assertEquals(true,service.task(42L,id).get("executionReady"),"configuration and heartbeat enable the existing task without recreating it");
        }
        assertEquals(3L,service.tasks(42L,"all","",1,20).get("total"));
        assertEquals(0L,service.tasks(84L,"all","",1,20).get("total"));
    }
    @Test void ownershipIdempotencyAndOptimisticEdits()
    {
        String id=create("same-request");
        assertEquals(id,service.create(42L,input("same-request",null)).get("taskId"));
        assertThrows(RuntimeException.class,()->service.create(42L,new ReportTaskInput("不同标题","其他要求","weekly",null,9,0,6,"same-request",null)));
        assertEquals(1L,service.tasks(42L,"all","",1,20).get("total"));
        assertEquals(0L,service.tasks(84L,"all","",1,20).get("total"));
        assertThrows(RuntimeException.class,()->service.task(84L,id));
        assertThrows(RuntimeException.class,()->service.update(84L,id,input("ignored",1)));
        assertEquals(2,service.update(42L,id,input("ignored",1)).get("version"));
        assertThrows(RuntimeException.class,()->service.update(42L,id,input("ignored",1)));
        assertThrows(RuntimeException.class,()->service.deleteTask(42L,id,1));
        assertEquals(0L,service.tasks(42L,"all","%",1,20).get("total"),"LIKE wildcards are escaped");
    }
    @Test void dueSlotsCoalesceAndPublicRecordsNeverExposeWorkerLeases()
    {
        String id=create("weekly"); due(id);
        Map<String,Object> job=service.claim();
        assertNotNull(job); assertNull(service.claim());
        assertTrue(((Number)service.task(42L,id).get("nextRunAt")).longValue()>System.currentTimeMillis());
        assertEquals(42L,service.workerOwner((String)job.get("runId"),(String)job.get("leaseToken")));
        assertThrows(RuntimeException.class,()->service.workerOwner((String)job.get("runId"),"wrong-lease"));
        service.finish((String)job.get("runId"),(String)job.get("leaseToken"),"# 本周趋势\n\n有日期和来源。",null);
        Map<String,Object> report=service.report(42L,(String)job.get("runId"));
        assertEquals("succeeded",report.get("status")); assertTrue(report.get("content").toString().contains("本周趋势"));
        assertFalse(report.containsKey("lease_token")); assertFalse(report.containsKey("user_id"));
        assertThrows(RuntimeException.class,()->service.report(84L,(String)job.get("runId")));
        assertNull(service.claim(),"old missed occurrences are not replayed");
    }
    @Test void pauseAndDeleteCancelOutstandingWorkAndKeepCompletedReports()
    {
        String id=create("cancel"); due(id); Map<String,Object> job=service.claim();
        int version=((Number)service.task(42L,id).get("version")).intValue();
        service.setStatus(42L,id,"pause",version);
        assertThrows(RuntimeException.class,()->service.workerOwner((String)job.get("runId"),(String)job.get("leaseToken")));
        assertThrows(RuntimeException.class,()->service.finish((String)job.get("runId"),(String)job.get("leaseToken"),"late",null));
        assertEquals("cancelled",service.report(42L,(String)job.get("runId")).get("status"));
        service.deleteTask(42L,id,version+1);
        assertEquals(1L,service.reports(42L,"recurring","",1,20).get("total"));
        service.deleteReport(42L,(String)job.get("runId"));
        assertEquals(0L,service.reports(42L,"all","",1,20).get("total"));
    }
    @Test void manualRequestsAreIdempotentAndTimeoutsAreExplicitFailures()
    {
        String id=create("manual");
        String run=(String)service.runNow(42L,id,"manual-request").get("runId");
        assertEquals(run,service.runNow(42L,id,"manual-request").get("runId"));
        String other=create("another-task");
        assertThrows(RuntimeException.class,()->service.runNow(42L,other,"manual-request"));
        assertThrows(RuntimeException.class,()->service.runNow(42L,id,"another-request"));
        Map<String,Object> job=service.claim(); assertEquals(run,job.get("runId"));
        assertThrows(RuntimeException.class,()->service.deleteReport(42L,run));
        jdbc.update("UPDATE agent_report_run SET deadline=0 WHERE run_id=?",run);
        assertNull(service.claim());
        assertEquals("failed",service.report(42L,run).get("status"));
        assertThrows(RuntimeException.class,()->service.finish(run,(String)job.get("leaseToken"),"late",null));
    }
    @Test void concurrentWorkersCannotClaimTheSameRun() throws Exception
    {
        String id=create("concurrent"); due(id);
        ExecutorService executor=Executors.newFixedThreadPool(2);
        try
        {
            CountDownLatch start=new CountDownLatch(1);
            Callable<Map<String,Object>> claim=()->{ start.await(); return service.claim(); };
            Future<Map<String,Object>> first=executor.submit(claim),second=executor.submit(claim); start.countDown();
            List<Map<String,Object>> claimed=new ArrayList<>();
            Map<String,Object> a=first.get(5,TimeUnit.SECONDS),b=second.get(5,TimeUnit.SECONDS);
            if(a!=null) claimed.add(a); if(b!=null) claimed.add(b);
            assertEquals(1,claimed.size());
        }
        finally { executor.shutdownNow(); }
    }
    @Test void oneOffTasksTriggerOnlyOnceAndFailuresCanBeRunManually()
    {
        String at=java.time.Instant.ofEpochMilli(System.currentTimeMillis()+120000).atZone(ReportSchedule.ZONE).toLocalDateTime().withNano(0).toString();
        String id=(String)service.create(42L,new ReportTaskInput("一次性持仓报告","查询今日持仓","once",at,null,null,null,"one-off",null)).get("taskId");
        due(id); Map<String,Object> job=service.claim();
        assertEquals("completed",service.task(42L,id).get("status")); assertNull(service.task(42L,id).get("nextRunAt"));
        service.finish((String)job.get("runId"),(String)job.get("leaseToken"),null,"行情不可用");
        assertNull(service.claim(),"a failed one-off run is not retried automatically");
        Map<String,Object> manual=service.runNow(42L,id,"retry-explicitly-authorized");
        assertEquals("manual",manual.get("triggerType")); assertNotEquals(job.get("runId"),manual.get("runId"));
        assertEquals(2L,service.reports(42L,"once","",1,20).get("total"));
    }
}
