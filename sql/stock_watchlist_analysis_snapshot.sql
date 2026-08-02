-- 已部署股票模块的增量升级脚本：新增自选股票分析快照表。
create table if not exists stock_watchlist_analysis_snapshot (
  snapshot_id bigint not null auto_increment,
  user_id bigint not null,
  watchlist_id bigint not null,
  analysis_json longtext not null,
  analyzed_at datetime not null,
  create_time datetime,
  update_time datetime,
  primary key (snapshot_id),
  unique key uk_watchlist_analysis_snapshot_user_watchlist (user_id, watchlist_id)
) engine=InnoDB default charset=utf8mb4 comment='自选股票分析快照';
