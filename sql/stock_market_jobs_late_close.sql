-- Existing installations: apply while Java is stopped, then restart to reload Quartz.
-- Explicitly replaces the two daily jobs' schedules; preserves enabled/paused status.
-- Public qfq data was still incomplete at 17:00 in production; this is a later
-- collection window, not a guarantee that the public provider has finished updating.
UPDATE sys_job
SET cron_expression='0 30 21 * * ?',time_zone='Asia/Shanghai',misfire_policy='3',concurrent='1',
    update_by='admin',update_time=NOW(),
    remark='北京时间21:30更新MySQL双口径日线；周末跳过，数据未就绪则失败；可用syncDate指定日期补跑'
WHERE invoke_target='stockMarketTask.syncDaily()';

UPDATE sys_job
SET cron_expression='0 0 23 * * ?',time_zone='Asia/Shanghai',misfire_policy='3',concurrent='1',
    update_by='admin',update_time=NOW(),
    remark='北京时间23:00读取当日已完成行情批次；保存全部判定及候选；失败不替换上一期结果'
WHERE invoke_target='stockMarketTask.screenDaily()';
