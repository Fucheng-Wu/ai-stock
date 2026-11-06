-- 已安装报告中心的环境执行此迁移即可；不修改任务、报告或角色授权。
-- 保留2020菜单记录及旧路由，只隐藏独立入口，权限供Agent页右侧栏复用。
UPDATE sys_menu SET visible='1', update_by='admin', update_time=SYSDATE(),
 remark='Agent助手右侧报告中心，隐藏独立菜单并保留权限及旧地址'
WHERE menu_id=2020 AND perms='agent:report:list';
