-- 报告中心。时间戳均为UTC毫秒；日历规则固定Asia/Shanghai。
CREATE TABLE IF NOT EXISTS agent_report_task (
 task_id varchar(36) NOT NULL, user_id bigint NOT NULL,
 title varchar(100) NOT NULL, prompt text NOT NULL,
 schedule_type varchar(16) NOT NULL, run_at varchar(32) DEFAULT NULL,
 hour int DEFAULT NULL, minute int DEFAULT NULL, week_day int DEFAULT NULL,
 week_days varchar(13) DEFAULT NULL, workweek varchar(8) DEFAULT NULL,
 schedule_message varchar(255) DEFAULT NULL,
 status varchar(16) NOT NULL DEFAULT 'enabled', next_run_at bigint DEFAULT NULL,
 version int NOT NULL DEFAULT 1, request_key varchar(128) NOT NULL,
 deleted tinyint NOT NULL DEFAULT 0, created_at bigint NOT NULL, updated_at bigint NOT NULL,
 PRIMARY KEY(task_id), UNIQUE KEY uk_report_task_request(user_id,request_key),
 KEY idx_report_due(deleted,status,next_run_at), KEY idx_report_task_owner(user_id,deleted,created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户定时报告任务';

CREATE TABLE IF NOT EXISTS agent_report_run (
 run_id varchar(36) NOT NULL, task_id varchar(36) NOT NULL, user_id bigint NOT NULL,
 title varchar(100) NOT NULL, prompt text NOT NULL, schedule_type varchar(16) NOT NULL,
 trigger_type varchar(16) NOT NULL, scheduled_at bigint NOT NULL,
 status varchar(16) NOT NULL, started_at bigint DEFAULT NULL, finished_at bigint DEFAULT NULL,
 deadline bigint DEFAULT NULL, lease_token varchar(36) DEFAULT NULL,
 content mediumtext DEFAULT NULL, error varchar(1000) DEFAULT NULL,
 request_key varchar(128) DEFAULT NULL, deleted tinyint NOT NULL DEFAULT 0,
 PRIMARY KEY(run_id), UNIQUE KEY uk_report_slot(task_id,scheduled_at,trigger_type),
 UNIQUE KEY uk_report_run_request(user_id,request_key),
 KEY idx_report_queue(status,scheduled_at), KEY idx_report_run_task(task_id,status),
 KEY idx_report_owner(user_id,deleted,scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='报告执行记录与正文';

INSERT INTO sys_menu(menu_id,menu_name,parent_id,order_num,path,component,route_name,is_frame,is_cache,menu_type,visible,status,perms,icon,create_by,create_time,remark)
VALUES (2020,'报告中心',0,9,'agent-reports','agent/reports/index','AgentReports',1,0,'C','1','0','agent:report:list','date','admin',SYSDATE(),'Agent助手右侧报告中心，隐藏独立菜单并保留权限及旧地址')
ON DUPLICATE KEY UPDATE menu_name=VALUES(menu_name),component=VALUES(component),perms=VALUES(perms),route_name=VALUES(route_name),visible=VALUES(visible),remark=VALUES(remark);
INSERT INTO sys_menu(menu_id,menu_name,parent_id,order_num,path,is_frame,is_cache,menu_type,visible,status,perms,icon,create_by,create_time)
VALUES (2021,'创建报告任务',2020,1,'',1,0,'F','0','0','agent:report:add','#','admin',SYSDATE()),
 (2022,'修改报告任务',2020,2,'',1,0,'F','0','0','agent:report:edit','#','admin',SYSDATE()),
 (2023,'删除报告任务及报告',2020,3,'',1,0,'F','0','0','agent:report:remove','#','admin',SYSDATE())
ON DUPLICATE KEY UPDATE menu_name=VALUES(menu_name),parent_id=VALUES(parent_id),perms=VALUES(perms);
INSERT IGNORE INTO sys_role_menu(role_id,menu_id) VALUES
 (1,2020),(1,2021),(1,2022),(1,2023),(4,2020),(4,2021),(4,2022),(4,2023);
