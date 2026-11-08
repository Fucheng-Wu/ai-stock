package com.ruoyi.system.service.report;

import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Runs the same lifecycle/concurrency suite on real MySQL, including 5.7. */
@EnabledIfEnvironmentVariable(named="REPORT_TEST_MYSQL", matches="1")
class AgentReportMySqlTest extends AgentReportServiceTest
{
    private JdbcTemplate admin;
    private String schema;

    @Override protected DriverManagerDataSource dataSource()
    {
        // Example URL: jdbc:mysql://127.0.0.1:3306/{schema}?useSSL=false
        String url = System.getenv("REPORT_TEST_MYSQL_URL");
        if (url == null || !url.contains("{schema}")) throw new IllegalArgumentException("REPORT_TEST_MYSQL_URL must contain {schema}");
        String user = System.getenv("REPORT_TEST_MYSQL_USER"), password = System.getenv("REPORT_TEST_MYSQL_PASSWORD");
        admin = new JdbcTemplate(new DriverManagerDataSource(url.replace("{schema}", "mysql"), user, password));
        schema = "report_claim_test_" + UUID.randomUUID().toString().replace("-", "");
        admin.execute("CREATE DATABASE `" + schema + "` CHARACTER SET utf8mb4");
        return new DriverManagerDataSource(url.replace("{schema}", schema), user, password);
    }

    @AfterEach void cleanup()
    {
        if (schema != null && schema.matches("report_claim_test_[a-f0-9]{32}")) admin.execute("DROP DATABASE `" + schema + "`");
    }
}
