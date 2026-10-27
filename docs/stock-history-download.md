# 免费 A 股历史数据下载

正式运行已使用 **MySQL行情表 + 若依16点采集、17点筛选**，固定北京时间。
历史迁移、表结构、任务补跑与服务器升级见 [全市场MySQL部署](deploy-stock-screener.md)。
本页前半部分保留首次SQLite下载与离线校验流程；不会自动把新离线文件发布到线上MySQL。

第一批保存最近一年、当前 A 股股票清单覆盖的日线，覆盖沪深北三地。仅下载公开数据，
不依赖模型 API、Tushare、MySQL 或网站登录账号。

## 在 Windows 下载

项目已经有 Python 和 requests 时，可以直接运行：

```powershell
# 首次指定固定区间，后台下载；截止日使用已经收盘且行情已更新的日期
.\bin\download-stock-history.ps1 -StartDate 2025-10-27 -EndDate 2026-10-26 -Background

# 查看已保存的股票数、日线数、各交易所覆盖率和任务状态
.\bin\download-stock-history.ps1 -Status

# 中断后继续：自动使用数据库里最近一批的原始日期，跳过已成功股票
.\bin\download-stock-history.ps1 -Background
```

需要安装依赖时：`python -m pip install -r tools/stock_history/requirements.txt`。
Python 下载程序路径为 `tools/stock_history/download.py`，可以通过 `--help` 查看参数。
仅验证三地样本时，可以在首次命令增加 `-Symbols 'sz000001,sh600519,bj920000'`。
此时完整清单仍会保存，未下载的股票显示为 pending；去掉 Symbols 再运行即可继续全市场。

## 数据位置

默认目录是仓库的 `data/stock-history/`，已排除 Git 跟踪。

- `history.sqlite3`：股票清单、双口径日线、逐只下载状态。
- `report-开始日期_结束日期.json`：进度、覆盖率、失败清单及原因。
- `download-*.log` / `download-*.error.log`：后台运行日志。
- `last-process.json`：最近启动的进程 ID 和日志路径。

下载期间保持电脑开机联网。关闭电脑或停止进程不会丢失已提交的数据，再次运行恢复。
并发下载由文件锁限制为一个进程；查看状态可以与下载同时运行。
SQLite 运行中可能有 `-wal`、`-shm` 文件，需要复制数据库时应先停止下载并关闭连接，
或使用 SQLite 的 backup API，不能只复制正在写入的主文件。

## 数据口径

- 股票清单：新浪 `hs_a`，校验总数、重复代码和分页完整性；保留 ST，不在采集层过滤。
- 日线：腾讯 `newfqkline`，保存不复权和前复权两套 OHLC，日期严格截取到指定区间。
- 成交量：上游单位为手，本地统一转换为整数股；不把该字段当作成交额。
- `daily_bars`：`batch_id, symbol, trade_date, raw_open, raw_high, raw_low, raw_close,`
  `qfq_open, qfq_high, qfq_low, qfq_close, volume_shares`。
- `securities`：每批股票清单、名称、交易所、状态、日期范围、抓取时间、响应 SHA256。
- `batches`：日期范围、清单来源、数量和任务状态。

两种价格序列的交易日期和成交量必须一致，否则记录为失败，不保存不完整股票数据。
逐只事务提交，两套价格与完成状态同时落盘。失败股票会在恢复时重试。
短历史可能来自新股或停牌，逐只保存实际首尾日期；空数据、异常价格不能当作成功。
只有全部股票成功才标记 complete；partial、error 和 pending 需要继续核实。

前复权值是抓取时的数据口径，不等于可直接用于任意历史时点的复权因子。
本批数据主要用于当前 520 筛选；后续更新应建立新的快照，不能把新前复权值直接追加到旧序列。
当前上市股票清单也不代表历史上市/退市股票全集，历史回测需要另外处理幸存者偏差。

## 限速和故障

默认两个工作线程，全局请求间隔至少 0.5 秒；失败请求有指数退避和有限重试。
连续八只失败时暂停任务，避免持续请求失效接口。免费上游没有可用性保证，
全市场需要逐只请求两种口径，完整下载可能持续数小时，以实际日志为准。
目前不将东方财富用作必需依赖：本机试连失败，而新浪清单及腾讯沪深北样本均返回数据。
程序沿用当前进程的网络/代理设置，不修改系统代理。

## 本地验证

```powershell
python -m unittest discover -s tools/stock_history -p 'test_*.py' -v
```

验证日期截取、手转股、无除权时的响应格式、异常数据拒绝、事务回滚和重复运行去重。

## 下载完成后：生成全市场 520 买点清单

```powershell
# 使用最近一批完整下载的数据，在其最后一个行情日运行规则
.\bin\screen-stock-history.ps1

# 可选：明确排除名称带 ST 风险警示标记的股票
.\bin\screen-stock-history.ps1 -ExcludeST
```

本地筛选需要 JDK 17+ 和项目 Maven 缓存里的 fastjson2，不请求网络、不调用大模型。
程序自动读取 Maven settings 的 localRepository；特殊环境可以直接运行
`python tools/stock_history/screen.py --fastjson-jar 完整jar路径`。

筛选直接编译、调用项目 `StockStrategyReportBuilder`，未在 Python 另写买点规则。
在线分析和筛选共用 `StockMovingAverage`，保留原有两位小数的均线算法。
输入为最多 80 根日线，先算均线，再按在线分析口径把最后 60 根交给规则引擎。
趋势必须为 UP，并且三个买点子项至少有一项 SATISFIED 才入选。

保存位置为 `data/stock-history/screens/`：

- `latest.json`：最近一次成功筛选的汇总和结果目录。
- 每次结果目录中的 `candidates.csv`：全部命中股票，UTF-8 BOM，支持 Excel 打开。
- `summary.md`：统计与前 50 只预览，按代码排序，不表示推荐强度。
- `analysis.jsonl`：所有股票的逐只判定及 Java 引擎完整规则证据。
- `candidates.json`：离线候选快照，含规则证据；正式网关使用MySQL结果。
- `excluded.json`：数据过旧、少于 21 根日线、当日无成交量，以及可选 ST 过滤的排除记录。
- `report.json`：行情日期、下载批次、引擎源码 SHA256、复权口径、数量与排除原因。

ST 默认参与计算并显式标记；各买点命中数可以重叠，以去重后的命中股票数为总数。
旧日期的最新 K 线不当作目标交易日信号。新股必须至少有 21 根日线，才能比较当日与前一日 MA20。
结果是指定行情日的技术规则候选；下载期间的名称状态、当前股票清单和前复权快照
不能当作完整历史时点信息。即使传入早期日期，也不构成无幸存者偏差、无未来信息的回测。
本地腾讯前复权数据与现有在线页面的新浪数据可能有口径差异；同一数据输入下规则一致，
页面若要展示本批筛选的原始证据，需要进一步接入这一快照。

## 在 Agent 助手查询

网关新增 `stock-screener`（全市场选股）子代理，使用 `stock_screen` 和
`stock_screen_detail` 两个只读业务工具，不运行 Python、不执行代码、不获取实时行情。
每次调用重新校验当前登录账号的 `agent:chat:use` 和 `stock:analyzer:analyze` 权限。
网关通过 `STOCK_API_BASE_URL` 调用 Java `/stock/screener/results` 和 `/detail`，
直接读取MySQL已完成结果，不读取 `STOCK_SCREEN_DATA_DIR`，不在接口失败时回退到旧文件。
首次把旧数据迁入已有本机数据库：

```powershell
python tools/stock_history/import_mysql.py --env-file agent-gateway/.env --sqlite data/stock-history/history.sqlite3 --screen-dir data/stock-history/screens --apply-schema --register-jobs
```

先完成SQL迁移，再启动新版Java后端与网关。新建聊天后，可以输入：

- “找出符合520买点的A股，注明行情日期，先列10只。”
- “只看缩量回踩的北交所股票。”
- “继续上一份快照的下一页。”
- “解释刚才某只候选为什么命中，保留原快照。”

候选支持买点、沪深北、ST排除及代码/名称过滤，默认按代码排序，每页默认10只、最多50只。
名单没有行业或成交额字段，不提供这些维度的筛选或排序。详情可以查询已保存范围内的
未命中或被排除股票；只有名称时需先唯一精确解析为代码，不能猜代码。
列表和详情返回同一 snapshotId、行情日期和覆盖统计，查询时间不能当作行情时间。
缺失日期、数据库异常、身份失效、权限不足都会明确失败，不作为零候选处理。
每日16点抓取全市场最新300根双口径日线并更新MySQL；17点从当天成功批次生成新筛选快照。
周末跳过，其他休市日或指数未更新时记录未就绪，不使用昨日数据冒充当日结果。
采集未完成、失败或17点仍占用采集锁时，不发布新筛选，需要在若依定时任务管理中核实并补跑。
新完整结果发布后查询自动可见，无需重启网关；历史快照保留。
服务器首次迁移可以使用 `bin/package-deploy.ps1 -IncludeStockHistory` 带上完整数据，
按部署文档导入服务器自己的MySQL。本机数据不随Git提交自动出现在服务器。

### 本机端口与启动

如果3000端口运行另一份旧网关，可以使用独立端口启动本项目：

```powershell
.\bin\start-agent-gateway.ps1 -Port 3100
```

前端开发代理通过 `AGENT_GATEWAY_URL` 选择网关，可在本机不提交的
`ruoyi-ui/.env.development.local` 写入 `AGENT_GATEWAY_URL=http://127.0.0.1:3100`，
然后重启前端开发服务器。若依后端仍需在配置的 `STOCK_API_BASE_URL` 运行，
登录和业务权限校验必须可用后才能在 Agent 页面实际查询。
不要启动第二份已经在同一端口运行的网关。生产域名需要另行部署本次代码与数据库迁移，
本机修改不会自动更新线上站点。

本项目的 `bin/start-ruoyi.ps1` 默认复用 `agent-gateway/.env` 的数据库配置，
通过仅本次进程有效的环境变量传给 Java，避免本机 YAML 和网关密码不一致；
已有的 Spring 数据源环境变量优先。凭证不写入命令行或日志，也不复制到 Git 配置。
需要保留若依自身数据库配置时使用 `bin/start-ruoyi.ps1 -UseApplicationDatabaseConfig`。
