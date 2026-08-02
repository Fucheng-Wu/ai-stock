-- 为已有数据库新增 DeepSeek API Key 参数（可重复执行）
insert into sys_config
    (config_name, config_key, config_value, config_type, create_by, create_time, update_by, update_time, remark)
select
    '股票分析-DeepSeek API Key',
    'stock.deepseek.apiKey',
    '',
    'Y',
    'admin',
    sysdate(),
    '',
    null,
    '股票AI分析使用的DeepSeek API Key，参数设置保存后立即生效'
where not exists
    (select 1 from sys_config where config_key = 'stock.deepseek.apiKey');
