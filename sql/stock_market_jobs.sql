-- Add per-job timezone without changing the timezone of existing jobs.
SET @stock_timezone_ddl = IF(
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='sys_job' AND column_name='time_zone')=0,
  'ALTER TABLE sys_job ADD COLUMN time_zone VARCHAR(64) DEFAULT NULL COMMENT ''Optional Quartz timezone''',
  'SELECT 1');
PREPARE stock_timezone_statement FROM @stock_timezone_ddl;
EXECUTE stock_timezone_statement;
DEALLOCATE PREPARE stock_timezone_statement;

INSERT INTO sys_job(job_name,job_group,invoke_target,cron_expression,time_zone,misfire_policy,concurrent,status,create_by,create_time,remark)
SELECT '全市场日线行情更新','DEFAULT','stockMarketTask.syncDaily()','0 0 16 * * ?','Asia/Shanghai','3','1','0','admin',NOW(),
       '北京时间16:00更新MySQL日线；周末跳过，指数日线未就绪则失败；可在任务管理补跑'
WHERE NOT EXISTS (SELECT 1 FROM sys_job WHERE invoke_target='stockMarketTask.syncDaily()');

INSERT INTO sys_job(job_name,job_group,invoke_target,cron_expression,time_zone,misfire_policy,concurrent,status,create_by,create_time,remark)
SELECT '全市场520买点筛选','DEFAULT','stockMarketTask.screenDaily()','0 0 17 * * ?','Asia/Shanghai','3','1','0','admin',NOW(),
       '北京时间17:00读取当日已完成行情批次；保存全部判定及候选；失败不替换上一期结果'
WHERE NOT EXISTS (SELECT 1 FROM sys_job WHERE invoke_target='stockMarketTask.screenDaily()');
