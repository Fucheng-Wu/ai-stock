-- 个人待办清单：数据表与菜单（可重复执行）
-- 注意: sysdate() 是 MySQL 函数，若使用其他数据库需替换

create table if not exists todo_task (
  task_id bigint(20) not null auto_increment,
  user_id bigint(20) not null,
  content varchar(500) not null,
  category varchar(20) not null,
  status char(1) not null default '0' comment '0未完成 1已完成',
  create_by varchar(64) default '',
  create_time datetime default null,
  update_by varchar(64) default '',
  update_time datetime default null,
  primary key (task_id),
  key idx_todo_task_user_status (user_id, status)
) engine=InnoDB default charset=utf8mb4 comment='个人待办事项';

-- 1. 页面: 待办清单（一级菜单，order=7 放在股票管理、JupyterLab控制台之后）
insert into sys_menu
(menu_id, menu_name, parent_id, order_num, path, component, query, route_name,
 is_frame, is_cache, menu_type, visible, status, perms, icon,
 create_by, create_time, update_by, update_time, remark)
values
(2014, '待办清单', 0, 7, 'todo', 'todo/index', '', '', 1, 0, 'C', '0', '0', 'todo:task:list', 'list', 'admin', sysdate(), '', null, '个人待办清单')
on duplicate key update
 menu_name=values(menu_name), parent_id=values(parent_id), order_num=values(order_num),
 path=values(path), component=values(component), query=values(query),
 route_name=values(route_name), is_frame=values(is_frame), is_cache=values(is_cache),
 menu_type=values(menu_type), visible=values(visible), status=values(status),
 perms=values(perms), icon=values(icon), update_by='admin', update_time=sysdate(),
 remark=values(remark);

-- 2. 按钮权限: 新增、修改、删除
insert into sys_menu
(menu_id, menu_name, parent_id, order_num, path, component, query, route_name,
 is_frame, is_cache, menu_type, visible, status, perms, icon,
 create_by, create_time, update_by, update_time, remark)
values
(2015, '新增待办', 2014, 1, '#', '', '', '', 1, 0, 'F', '0', '0', 'todo:task:add', '#', 'admin', sysdate(), '', null, '')
on duplicate key update
 menu_name=values(menu_name), parent_id=values(parent_id), order_num=values(order_num),
 path=values(path), component=values(component), perms=values(perms), icon=values(icon),
 menu_type=values(menu_type), visible=values(visible), status=values(status),
 update_by='admin', update_time=sysdate();

insert into sys_menu
(menu_id, menu_name, parent_id, order_num, path, component, query, route_name,
 is_frame, is_cache, menu_type, visible, status, perms, icon,
 create_by, create_time, update_by, update_time, remark)
values
(2016, '修改待办', 2014, 2, '#', '', '', '', 1, 0, 'F', '0', '0', 'todo:task:edit', '#', 'admin', sysdate(), '', null, '')
on duplicate key update
 menu_name=values(menu_name), parent_id=values(parent_id), order_num=values(order_num),
 path=values(path), component=values(component), perms=values(perms), icon=values(icon),
 menu_type=values(menu_type), visible=values(visible), status=values(status),
 update_by='admin', update_time=sysdate();

insert into sys_menu
(menu_id, menu_name, parent_id, order_num, path, component, query, route_name,
 is_frame, is_cache, menu_type, visible, status, perms, icon,
 create_by, create_time, update_by, update_time, remark)
values
(2017, '删除待办', 2014, 3, '#', '', '', '', 1, 0, 'F', '0', '0', 'todo:task:remove', '#', 'admin', sysdate(), '', null, '')
on duplicate key update
 menu_name=values(menu_name), parent_id=values(parent_id), order_num=values(order_num),
 path=values(path), component=values(component), perms=values(perms), icon=values(icon),
 menu_type=values(menu_type), visible=values(visible), status=values(status),
 update_by='admin', update_time=sysdate();
