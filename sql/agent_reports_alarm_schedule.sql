-- 已有报告中心升级：先执行本脚本，再部署新版 Java/前端/网关。可重复执行。
-- week_days：自定义星期1至7，逗号分隔；workweek：single/double；保留旧weekly规则。
SET @report_ddl = IF(
 (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='agent_report_task' AND column_name='week_days')=0,
 'ALTER TABLE agent_report_task ADD COLUMN week_days varchar(13) DEFAULT NULL', 'SELECT 1');
PREPARE report_stmt FROM @report_ddl;
EXECUTE report_stmt;
DEALLOCATE PREPARE report_stmt;
SET @report_ddl = IF(
 (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='agent_report_task' AND column_name='workweek')=0,
 'ALTER TABLE agent_report_task ADD COLUMN workweek varchar(8) DEFAULT NULL', 'SELECT 1');
PREPARE report_stmt FROM @report_ddl;
EXECUTE report_stmt;
DEALLOCATE PREPARE report_stmt;
SET @report_ddl = IF(
 (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='agent_report_task' AND column_name='schedule_message')=0,
 'ALTER TABLE agent_report_task ADD COLUMN schedule_message varchar(255) DEFAULT NULL', 'SELECT 1');
PREPARE report_stmt FROM @report_ddl;
EXECUTE report_stmt;
DEALLOCATE PREPARE report_stmt;
