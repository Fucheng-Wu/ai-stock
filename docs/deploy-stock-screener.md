# 全市场行情 MySQL 与每日 520 筛选部署

本版把行情和选股结果迁到 MySQL，Agent 通过已鉴权的 Java API 查询。
日常采集、计算均由 Java / 若依 Quartz 执行；Python 仅用于一次性迁移旧 SQLite 数据。
现有部署目录按 `/home/wufc/ai-stock`、服务按 `ai-stock` / `ai-stock-agent` 举例。

## 表与调度

先执行 `sql/stock_market.sql`，再执行 `sql/stock_market_jobs.sql`，最后启动新版 Java。
第二个脚本会为 `sys_job` 增加可空 `time_zone` 列，其他任务保留原时区行为。
两个 SQL 可重复执行；不会删除历史表、清空聊天记录或覆盖已有同名调用任务的配置。

| 表 | 内容 |
|---|---|
| stock_market_security | 沪深北股票清单、名称、状态 |
| stock_market_daily | 不复权/前复权 OHLC、成交量（股），主键 symbol + trade_date |
| stock_market_sync_run | 每次同步状态、目标日期、覆盖数量、失败原因 |
| stock_market_sync_item | 每只股票的同步状态和最新日线日期 |
| stock_screen_run | 筛选快照、行情日、引擎摘要、候选及排除统计 |
| stock_screen_result | 每只股票的完整规则证据，包括命中、未命中与排除原因 |

| 若依调用目标 | Cron | 固定时区 |
|---|---|---|
| stockMarketTask.syncDaily() | `0 0 16 * * ?` | Asia/Shanghai |
| stockMarketTask.screenDaily() | `0 0 17 * * ?` | Asia/Shanghai |

周末跳过。工作日必须能取得当天上证指数日线，否则记录未就绪/失败；这可能是节假日，
也可能是接口延迟，程序不会用昨日行情冒充今日行情。筛选只接受当日最新一次同步尝试完整成功的批次。
停牌数据日期过旧、新股少于 21 根日线、当天成交量为零分别记录排除原因。

每天重新抓取当前全市场清单及最近 300 根日线，更新重复日期、添加新日期，并刷新该窗口的前复权值。
历史原始日线累计保留；更早前复权记录的 `qfq_as_of_date` 保留原基准日期，不能混合作为最新复权序列。
筛选只使用同一成功批次、同一复权基准的最近 80 根日线。均线与买点复用 Java 在线分析规则。
已有历史筛选证据独立保存，不随新日线刷新而改变。

默认 4 个线程、全局每 200ms 最多发起一个请求，失败重试最多 3 次。
约 5,600 只股票、每只两个请求，理论采集至少约 38 分钟，实际耗时受网络影响。
配置可选 `stock.market.workers`（1–8）和 `stock.market.request-interval-ms`（至少100），不要盲目提高请求速率。
采集、筛选、迁移使用同一 MySQL 命名锁；若 17 点仍在采集，筛选失败并写日志，需要采集完成后补跑。
停机错过触发不补执行，避免开机时同时抓取/筛选；任务默认启用、禁止自身并发。

## 本机打包

首次服务器迁移携带一年历史数据和原筛选证据：

```powershell
.\bin\package-deploy.ps1 -Version 0.1.2 -IncludeStockHistory
```

若刚完成并验证 Maven 与 Vue 生产构建，可加 `-SkipBuild`。
`-IncludeStockHistory` 会使用 SQLite backup API 生成一致副本，并自动包含最新离线筛选结果。
包内含迁移工具、SQL、部署文档，输出为仓库同级 `ai-stock-deploy-v0.1.2.zip` 和 `.zip.sha256`。
不含本机 `.env`、认证文件、node_modules 或含 Token 的 JupyterLab SQL。
JAR 部署副本会移除开发配置和凭证字面量，服务器仍使用原有外部配置与密钥。
后续代码升级可省略 `-IncludeStockHistory`，服务器 MySQL 已有历史数据无需重复上传。
单独使用 `-IncludeStockScreen` 只包含离线结果备份，不能代替本版的 MySQL 行情迁移。

## 服务器停服、备份、更新

先将升级包及校验文件上传到 `/home/wufc/`。以下在服务器同一个 shell 中执行：

```bash
set -euo pipefail
cd /home/wufc
sha256sum -c ai-stock-deploy-v0.1.2.zip.sha256
sudo systemctl show ai-stock ai-stock-agent -p WorkingDirectory -p FragmentPath --no-pager
test -f ai-stock/config/ai-stock.env
test -f ai-stock/config/agent-gateway.env
sudo systemctl stop ai-stock-agent ai-stock
backup_dir="/home/wufc/ai-stock-backup-$(date +%Y%m%d-%H%M%S)"
cp -a /home/wufc/ai-stock "$backup_dir"
printf 'Backup: %s\n' "$backup_dir"
unzip -o ai-stock-deploy-v0.1.2.zip -d /home/wufc/ai-stock \
  -x 'config/*' 'nginx/*' 'systemd/*'
```

同时用服务器现有方式备份 MySQL。程序目录备份不包含数据库。
保留服务器 `config/*.env`、`config/application*.yml`、Nginx HTTPS/JupyterLab 配置、
systemd 服务和 `/home/wufc/.pi/agent`。不执行若依初始化 SQL，不用本机配置覆盖生产配置。

## 一次性导入历史与登记任务

服务器现有 `config/ai-stock.env` 使用 `DB_HOST/PORT/NAME/USER/PASSWORD`；迁移工具也支持
`AGENT_DB_*`。选择连接若依业务库的配置，不能误用另一个独立聊天库。密码不写入命令行。
DDL 迁移账号需有建表和修改 `sys_job` 的权限；Java 运行账号需能读写上述业务表。
网关沿用现有聊天库权限，通过 Java API 查询股票，无需增加股票表写权限。

```bash
cd /home/wufc/ai-stock
python3 -m venv .market-migrate-venv
.market-migrate-venv/bin/python -m pip install -r tools/stock_history/requirements.txt
.market-migrate-venv/bin/python tools/stock_history/import_mysql.py \
  --env-file config/ai-stock.env \
  --sqlite data/stock-history/history.sqlite3 \
  --screen-dir data/stock-history/screens \
  --apply-schema --register-jobs
```

程序分批提交、允许中断重跑，不产生重复股票/日期记录；只有全量导入并校验成功才发布 COMPLETE。
原 SQLite 与离线快照保持不变，已有快照 ID 继续可查询。若 MySQL 已更新到更晚日期，禁止用旧行情覆盖。
初始基线：5,576 只、1,326,482 条日线、日期 2025-10-27 至 2026-10-26；候选 43 只。

如果不迁移旧数据，可通过现有数据库管理工具执行两个 SQL，启动后手动执行一次 16 点同步任务，
成功后再执行筛选任务；将从最近 300 根日线开始积累，不含本机一年历史的完整原始记录。

## 启动验收

确认现有 `config/agent-gateway.env` 的 `STOCK_API_BASE_URL` 指向本机 Java，例如
`http://127.0.0.1:8080`。`STOCK_SCREEN_DATA_DIR` 已不用于正式查询，可以删除旧配置。
保留已有模型认证；新会话默认 `deepseek-flash` / low，前提是服务端已配置该模型。

```bash
cd /home/wufc/ai-stock/agent-gateway
pnpm install --frozen-lockfile
pnpm --filter ./backend typecheck
sudo systemctl start ai-stock
curl --fail --retry 15 --retry-connrefused --retry-delay 2 http://127.0.0.1:8080/
sudo systemctl start ai-stock-agent
curl --fail --retry 15 --retry-connrefused --retry-delay 2 http://127.0.0.1:3000/api/health
sudo systemctl status ai-stock ai-stock-agent --no-pager
```

在若依「系统监控 → 定时任务」查看两个新增任务（调用目标如上），状态应为正常。
SQL 中 `time_zone` 应为 Asia/Shanghai；即使服务器使用 UTC 也按北京时间执行。
前端旧的 Cron 预览不代表固定时区，请以调度记录与任务日志为准。
当天错过 16 点，手动点击「执行一次」同步，完成后再手动执行筛选。
要对初始已导入日期重筛，可临时新增一次调用 `stockMarketTask.screenDate('2026-10-26')`，
执行成功后删除该临时任务；若已更新到更晚复权基准，则查询保存的旧快照即可。

进入 Agent 新建会话：“找出最新一期符合520买点的A股，注明行情日期，先列10只”。
首批应显示 2026-10-26、范围 5,576 只、去重候选 43 只；缩量回踩 8 只。
列表和详情应保持相同 snapshotId。账号需有 `agent:chat:use`、`stock:analyzer:analyze`。
查询数据每日发布后立即可见，不需要重启网关。

Java 接口：`GET /stock/screener/results`、`GET /stock/screener/detail`，均要求登录和股票分析权限。
任务失败在「定时任务 → 日志」和 `journalctl -u ai-stock` 查看；按同步批次表查具体失败代码。
未完成批次不会发布新结果，查询仍返回最近成功快照及真实日期，不会显示成今日已更新。

## 回滚

先暂停两个新增任务并停服，再从实际备份目录恢复旧程序，恢复后按旧版要求提供离线快照。
保留新增行情表、筛选表及 sys_job.time_zone 列，不删除数据，不回滚聊天库。
原版 mapper 不读取新增列，额外列不影响旧任务；上线前应确认备份和服务目录。
