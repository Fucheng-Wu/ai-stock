-- Agent 对话：一级菜单（可重复执行）
-- 默认只授权角色 1、4；Agent Gateway 通过登录身份及独立管理权限校验访问。

insert into sys_menu
(menu_id, menu_name, parent_id, order_num, path, component, query, route_name,
 is_frame, is_cache, menu_type, visible, status, perms, icon,
 create_by, create_time, update_by, update_time, remark)
values
(2018, 'Agent助手', 0, 8, 'agent-chat', 'agent/chat/index', '', 'AgentChat',
 1, 0, 'C', '0', '0', 'agent:chat:use', 'message',
 'admin', sysdate(), '', null, '连接 Pi Agent Gateway 的智能对话页面')
on duplicate key update
 menu_name=values(menu_name), parent_id=values(parent_id), order_num=values(order_num),
 path=values(path), component=values(component), query=values(query),
 route_name=values(route_name), is_frame=values(is_frame), is_cache=values(is_cache),
 menu_type=values(menu_type), visible=values(visible), status=values(status),
 perms=values(perms), icon=values(icon), update_by='admin', update_time=sysdate(),
 remark=values(remark);

insert ignore into sys_role_menu (role_id, menu_id) values
(1, 2018),
(4, 2018);

-- 配置模型、Provider 认证、技能、插件和 MCP 的独立管理权限。
insert into sys_menu
(menu_id, menu_name, parent_id, order_num, path, component, is_frame, is_cache,
 menu_type, visible, status, perms, icon, create_by, create_time, remark)
values
(2019, 'Agent管理', 2018, 1, '', '', 1, 0, 'F', '0', '0', 'agent:chat:manage', '#',
 'admin', sysdate(), '独立于普通聊天权限的网关配置管理权限')
on duplicate key update parent_id=values(parent_id), perms=values(perms),
 menu_name=values(menu_name), menu_type=values(menu_type), update_by='admin', update_time=sysdate();

insert ignore into sys_role_menu (role_id, menu_id) values (1, 2019), (4, 2019);

