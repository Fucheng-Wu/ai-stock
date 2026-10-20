-- Agent 会话持久化（可重复执行）

create table if not exists agent_chat_session (
  session_id varchar(128) not null,
  workspace_key char(64) not null comment '工作目录SHA-256',
  workspace varchar(1024) not null,
  title varchar(255) not null default '新对话',
  session_path varchar(2048) default null comment 'Pi运行时JSONL路径',
  session_jsonl longtext default null comment 'Pi会话文件完整备份',
  model_provider varchar(128) default null,
  model_id varchar(255) default null,
  thinking_level varchar(16) not null default 'medium',
  transcript_json longtext not null comment '完整原始消息JSON',
  context_usage_json text default null,
  message_count int not null default 0,
  created_at datetime(3) not null,
  updated_at datetime(3) not null,
  primary key (session_id),
  key idx_agent_chat_workspace_updated (workspace_key, updated_at)
) engine=InnoDB default charset=utf8mb4 comment='Agent会话持久化';

