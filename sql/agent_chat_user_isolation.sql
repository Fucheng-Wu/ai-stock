-- Agent 会话用户隔离升级（在若依数据库中执行，可重复执行）。
-- 旧记录没有可信所属用户，保留 NULL，不自动归属，不删除数据。
-- 请由具备 ALTER 权限的数据库管理员执行；网关日常账号仍只需增删改查。

set @agent_owner_column_exists = (
  select count(*) from information_schema.columns
   where table_schema = database() and table_name = 'agent_chat_session' and column_name = 'user_id'
);
set @agent_owner_ddl = if(@agent_owner_column_exists = 0,
  'alter table agent_chat_session add column user_id varchar(64) default null comment ''若依用户ID；NULL为未归属的旧会话''',
  'select 1');
prepare agent_owner_statement from @agent_owner_ddl;
execute agent_owner_statement;
deallocate prepare agent_owner_statement;

set @agent_owner_index_exists = (
  select count(*) from information_schema.statistics
   where table_schema = database() and table_name = 'agent_chat_session' and index_name = 'idx_agent_chat_user_updated'
);
set @agent_owner_ddl = if(@agent_owner_index_exists = 0,
  'alter table agent_chat_session add index idx_agent_chat_user_updated (workspace_key, user_id, updated_at)',
  'select 1');
prepare agent_owner_statement from @agent_owner_ddl;
execute agent_owner_statement;
deallocate prepare agent_owner_statement;
