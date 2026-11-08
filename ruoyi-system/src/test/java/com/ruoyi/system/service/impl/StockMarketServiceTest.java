package com.ruoyi.system.service.impl;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import com.ruoyi.system.service.support.*;

/** Opt-in real MySQL tests use an isolated schema, never the workbench's data. */
@EnabledIfEnvironmentVariable(named="STOCK_TEST_MYSQL", matches="1")
class StockMarketServiceTest
{
    private JdbcTemplate admin, jdbc;
    private String schema;
    private StockMarketRepository repository;
    private StockMarketService service;
    private FakeSource source;
    private final LocalDate date = LocalDate.of(2026, 10, 26);

    @BeforeEach void setup() throws Exception
    {
        String base = System.getenv("STOCK_TEST_MYSQL_URL"), user = System.getenv("STOCK_TEST_MYSQL_USER"), password = System.getenv("STOCK_TEST_MYSQL_PASSWORD");
        admin = new JdbcTemplate(new DriverManagerDataSource(base, user, password));
        schema = "stock_market_test_" + UUID.randomUUID().toString().replace("-", "");
        assertTrue(schema.matches("stock_market_test_[a-f0-9]{32}"));
        admin.execute("CREATE DATABASE `" + schema + "` CHARACTER SET utf8mb4");
        jdbc = new JdbcTemplate(new DriverManagerDataSource(base.replace("?", "/" + schema + "?"), user, password));
        Path root = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (!Files.exists(root.resolve("sql/stock_market.sql"))) root = root.getParent();
        String script = Files.readString(root.resolve("sql/stock_market.sql")).replaceAll("(?m)^--.*$", "");
        for (String statement : script.split(";")) if (!statement.isBlank()) jdbc.execute(statement);
        repository = new StockMarketRepository(jdbc); source = new FakeSource(); service = new StockMarketService(repository, source, 2);
    }
    @AfterEach void cleanup()
    {
        if (schema != null && schema.matches("stock_market_test_[a-f0-9]{32}")) admin.execute("DROP DATABASE `" + schema + "`");
    }
    static class FakeSource implements StockMarketSource
    {
        boolean fail, ready = true;
        @Override public List<Security> universe() { return List.of(new Security("sh600519", "样本甲", "sh"), new Security("sz000001", "*ST样本乙", "sz")); }
        @Override public boolean marketReady(LocalDate date) { return ready; }
        @Override public List<Bar> history(String symbol, LocalDate target, int limit)
        {
            if (fail && symbol.equals("sz000001")) throw new IllegalStateException("fixture source failure");
            List<Bar> bars = new ArrayList<>();
            for (int i=0; i<41; i++)
            {
                double p = i == 40 ? 15 : i >= 35 ? 9 : 10;
                bars.add(new Bar(target.minusDays(40-i),p,p,p,p,p,p,p,p,i==40 ? 15000 : 10000));
            }
            return bars;
        }
    }
    @Test void upsertScreenAndStableSnapshots() throws Exception
    {
        service.sync(date); service.sync(date);
        assertEquals(82L, jdbc.queryForObject("SELECT COUNT(*) FROM stock_market_daily", Long.class));
        String first = service.screen(date), second = service.screen(date);
        assertNotEquals(first, second);
        Map<String,Object> page = repository.query(null,null,"GOLDEN_CROSS","ALL","",false,1,1);
        assertEquals(2L, page.get("total")); assertEquals(true,page.get("hasNextPage")); assertEquals(second,page.get("snapshotId"));
        assertTrue(String.valueOf(page.get("generatedAt")).endsWith("+08:00"));
        var savedTime = jdbc.queryForObject("SELECT DATE_FORMAT(finished_at,'%Y-%m-%d %H:%i:%s') FROM stock_screen_run WHERE snapshot_id=?",String.class,second);
        assertEquals(savedTime.replace(' ','T'),String.valueOf(page.get("generatedAt")).substring(0,19));
        assertEquals(1L, repository.query(first,null,"ALL","ALL","",true,1,10).get("total"));
        assertEquals(first,repository.detail("600519",first,null).get("snapshotId"));
        assertEquals(false,repository.detail("sz000009",first,null).get("found"));
        assertThrows(RuntimeException.class, () -> repository.query(null,date.plusDays(1),"ALL","ALL","",false,1,10));
        assertThrows(RuntimeException.class, () -> repository.query(null,null,"ALL","ALL","",false,1,100));
    }
    @Test void incompleteSameDayRefreshCannotFallBackToEarlierCompleteBatch() throws Exception
    {
        service.sync(date); String snapshot = service.screen(date);
        source.fail = true;
        assertThrows(Exception.class, () -> service.sync(date));
        assertEquals("FAILED", repository.latestSync(date).get("status"));
        assertThrows(Exception.class, () -> service.screen(date));
        assertEquals(snapshot,repository.query(null,null,"ALL","ALL","",false,1,10).get("snapshotId"));
    }
    @Test void readinessAndCrossProcessLockFailClosed() throws Exception
    {
        source.ready = false;
        assertThrows(Exception.class, () -> service.sync(date));
        assertEquals(0L,jdbc.queryForObject("SELECT COUNT(*) FROM stock_market_daily",Long.class));
        assertEquals("FAILED",repository.latestSync(date).get("status"));
        try (StockMarketRepository.PipelineLock ignored=repository.lock())
        { assertThrows(RuntimeException.class, () -> repository.lock()); }
    }
    @Test void weekendSkippedRunsDoNotPreventFridayRecovery() throws Exception
    {
        LocalDate friday = LocalDate.of(2026, 11, 6);
        source.fail = true; assertThrows(Exception.class, () -> service.sync(friday));
        service.sync(friday.plusDays(1)); service.sync(friday.plusDays(2));
        assertEquals("SKIPPED", repository.latestSync(null).get("status"));
        source.fail = false; service.sync(friday);
        assertEquals("COMPLETE", repository.latestSync(friday).get("status"));
        service.sync(friday.plusDays(2));
        assertNotNull(service.screen(friday), "a later skipped batch contains no newer price basis");
    }
    @Test void actualNewerPricesStillPreventOldDateWritesAndScreening() throws Exception
    {
        service.sync(date); service.sync(date.plusDays(1));
        assertEquals(date.plusDays(1), repository.latestPriceBasis());
        assertThrows(Exception.class, () -> service.sync(date));
        assertThrows(Exception.class, () -> service.screen(date));
    }
    @Test void laterPartialFailureStillPreventsOverwritingItsNewerPriceBasis() throws Exception
    {
        service.sync(date); source.fail = true;
        assertThrows(Exception.class, () -> service.sync(date.plusDays(1)));
        assertEquals("FAILED", repository.latestSync(null).get("status"));
        assertEquals(date.plusDays(1), repository.latestPriceBasis());
        assertThrows(Exception.class, () -> service.sync(date));
        assertThrows(Exception.class, () -> service.screen(date));
    }
    @Test void lateCloseMigrationIsIdempotentAndPreservesPausedJobs() throws Exception
    {
        jdbc.execute("CREATE TABLE sys_job (job_id BIGINT AUTO_INCREMENT PRIMARY KEY,job_name VARCHAR(100),job_group VARCHAR(64),invoke_target VARCHAR(255),cron_expression VARCHAR(255),misfire_policy VARCHAR(8),concurrent VARCHAR(8),status VARCHAR(8),create_by VARCHAR(64),create_time DATETIME,update_by VARCHAR(64),update_time DATETIME,remark VARCHAR(1000))");
        Path root = Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while (!Files.exists(root.resolve("sql/stock_market_jobs.sql"))) root = root.getParent();
        String install = Files.readString(root.resolve("sql/stock_market_jobs.sql")).replaceAll("(?m)^--.*$", "");
        executeScript(install);
        jdbc.update("UPDATE sys_job SET cron_expression='0 0 17 * * ?',status='1' WHERE invoke_target='stockMarketTask.syncDaily()'");
        String upgrade = Files.readString(root.resolve("sql/stock_market_jobs_late_close.sql")).replaceAll("(?m)^--.*$", "");
        for (int i = 0; i < 2; i++) executeScript(upgrade);
        assertEquals(2L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_job", Long.class));
        assertEquals("0 30 21 * * ?", jdbc.queryForObject("SELECT cron_expression FROM sys_job WHERE invoke_target='stockMarketTask.syncDaily()'", String.class));
        assertEquals("1", jdbc.queryForObject("SELECT status FROM sys_job WHERE invoke_target='stockMarketTask.syncDaily()'", String.class));
        assertEquals("0 0 23 * * ?", jdbc.queryForObject("SELECT cron_expression FROM sys_job WHERE invoke_target='stockMarketTask.screenDaily()'", String.class));
        assertEquals(2L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_job WHERE time_zone='Asia/Shanghai'", Long.class));
    }
    private void executeScript(String script)
    {
        // PREPARE and session variables must use the same connection, like a mysql client.
        jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Void>) connection -> {
            try (var statement = connection.createStatement())
            { for (String sql : script.split(";")) if (!sql.isBlank()) statement.execute(sql); }
            return null;
        });
    }
}
