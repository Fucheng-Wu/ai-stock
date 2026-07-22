-- 股票管理菜单 SQL（需在系统运行后执行，或合并到 ry_20260417.sql）
-- 注意: sysdate() 是 MySQL 函数，若使用其他数据库需替换

-- 1. 父目录: 股票管理（order_num=5 放在系统管理/监控/工具/官网之后）
insert into sys_menu values('2000', '股票管理', '0', '5', 'stock', null, '', '', 1, 0, 'M', '0', '0', '', 'stock', 'admin', sysdate(), '', null, '股票分析菜单目录');

-- 2. 页面: AI分析报告
insert into sys_menu values('2001', 'AI分析报告', '2000', '1', 'analyzer', 'stock/analyzer/index', '', '', 1, 0, 'C', '0', '0', 'stock:analyzer:analyze', 'chart', 'admin', sysdate(), '', null, '520均线战法AI分析');

-- 3. 按钮权限: AI分析
insert into sys_menu values('2002', 'AI分析', '2001', '1', '#', '', '', '', 1, 0, 'F', '0', '0', 'stock:analyzer:analyze', '#', 'admin', sysdate(), '', null, '');

-- 我的自选表与菜单
create table stock_watchlist (
  watchlist_id bigint(20) not null auto_increment,
  user_id bigint(20) not null,
  stock_code varchar(6) not null,
  stock_name varchar(50) default null,
  create_by varchar(64) default '',
  create_time datetime default null,
  update_by varchar(64) default '',
  update_time datetime default null,
  primary key (watchlist_id),
  unique key uk_stock_watchlist_user_code (user_id, stock_code)
) engine=InnoDB default charset=utf8mb4 comment='用户自选股票';

insert into sys_menu values('2003', '我的自选', '2000', '2', 'watchlist', 'stock/watchlist/index', '', '', 1, 0, 'C', '0', '0', 'stock:watchlist:list', 'star', 'admin', sysdate(), '', null, '我的自选股票');
insert into sys_menu values('2004', '加入自选', '2003', '1', '#', '', '', '', 1, 0, 'F', '0', '0', 'stock:watchlist:add', '#', 'admin', sysdate(), '', null, '');
insert into sys_menu values('2005', '删除自选', '2003', '2', '#', '', '', '', 1, 0, 'F', '0', '0', 'stock:watchlist:remove', '#', 'admin', sysdate(), '', null, '');
