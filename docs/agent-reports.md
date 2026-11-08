# 报告中心

报告中心位于 **Agent助手页面的右侧栏**，点击聊天页右上角“报告中心”打开或收起。桌面端与聊天并排显示，手机端覆盖聊天区域；报告和子代理过程面板互相切换，聊天内容及输入草稿保留。任务可通过侧栏或 Agent 的 `report-manager` 子代理管理。报告按创建时的一次性/定时规则分类，执行快照独立保存，修改任务不会改写历史报告。

独立菜单2020已隐藏，记录与按钮权限仍保留；旧 `/agent-reports` 地址会跳转到 `/agent-chat?panel=reports`。侧栏沿用报告权限，与Agent深浅主题同步；每轮对话结束时刷新已打开的列表，定时执行的进度仍自动轮询。

桌面端可拖动会话栏右边界、报告栏左边界来调整宽度，子代理面板也支持相同操作。会话栏、报告栏、子代理栏的宽度分别保存在当前浏览器，刷新或切换面板后保留；双击分隔条恢复默认。聚焦分隔条后可使用左右方向键（Shift加速）、Home/End调整到边界，Escape取消正在进行的拖拽。调整时保留聊天区域空间；手机和过窄容器维持覆盖布局，不显示拖拽条。

## 使用

- “每周六上午9点，生成这一周A股市场趋势分析报告，注明来源和日期。”
- “今天下午4点，汇总我的持仓个股今日概况，列出涨跌、520指标与风险。”
- “把每周市场报告改为周日10点。”
- “查看我的定时任务”“暂停市场周报”“删除持仓日报任务”“读一下最新的市场周报”。

页面支持任务增删改查、暂停/恢复、立即生成、报告阅读/删除及导出 HTML。打开报告后点击“导出 HTML”，可下载包含独立样式、标题、北京时间、正文、表格、代码和图表的单个文件；无需登录即可离线阅读，并支持浏览器打印。图表由内置 ECharts 渲染为嵌入图片，配置可展开查看；无效图表保留原始配置。外部图片保留为需联网查看的链接，引用链接保持可点击。导出逻辑位于 `ruoyi-ui/src/utils/agent-report-export.js`，不依赖 CDN 或运行脚本，不包含登录凭据。

对话修改或删除前先查询唯一目标及版本；多个匹配会询问。报告中心不会修改持仓或执行交易，也不发送外部通知。

## 升级部署

1. 首次安装执行 `sql/agent_reports.sql`，建立 `agent_report_task` 和 `agent_report_run`，添加2020至2023权限记录，默认授权角色1、4，2020独立菜单默认隐藏。**已有报告中心的环境**执行 `sql/agent_reports_sidebar.sql` 即可隐藏旧菜单，不改动任务、报告或授权；更新前端后从Agent页进入。
   **升级闹铃式重复规则**：已有报告表须在新版Java启动前执行 `sql/agent_reports_alarm_schedule.sql`（可重复执行），增加自定义星期、单双休方式和日历等待原因三个字段；原任务和历史报告保留。首次安装的建表SQL已包含字段。同步更新前端及网关角色和主Agent提示。
2. 生成至少32字符的随机密钥，将**相同值**配置在 Java 服务环境与 `agent-gateway/.env` 的 `AGENT_REPORT_WORKER_KEY`。Java 配置项为 `agent.report-worker-key`；生产 `config/application.yml` 同样从此环境变量读取。不要把实际密钥写入 Git 或聊天。
3. 部署新 Java、前端和整个网关 `src` / `subagents`（包含新增的 `report-manager`），重启 Java 与 Agent 网关。打包脚本已包含SQL、源码、配置模板与本文。
4. 确保默认 DeepSeek 模型、认证及行情服务可用。需要新闻/公开资料时还需配置 `TAVILY_API_KEY`。权限配置变化后刷新登录。
5. 打开Agent助手右侧报告中心，创建一条几分钟后的一次性任务，关闭聊天页后再返回，确认出现执行记录及正文。检查一次暂停、修改和删除。失败原因会记录在报告详情，修复后可手动重新生成。

不配置执行器密钥时普通聊天和任务创建、查询、编辑仍可使用；创建只校验当前用户权限及任务内容，不以执行器配置作为保存条件。接口返回实时 `executionReady` / `executionMessage`：未配置或未连接时，侧栏显示“待执行器就绪”，对话明确说明“任务已保存，暂不能执行”，不承诺按时生成。管理员完成配置并连接执行器后，已有任务继续使用，无需重建。立即生成与后台执行仍需执行器认证，Key 校验没有移除。无需用户保持登录，浏览器令牌不保存到任务表或执行记录。页面通过执行器心跳显示在线状态；密钥不一致、网关未启动或失联超过两分钟时提示检查服务。网关与 Java 应使用本机/受信网络通信，跨主机必须使用TLS；nginx模板已拒绝外部访问 `/prod-api/agent/report-worker/`，已有部署同步此规则。

## 调度与失败语义

- 重复规则像手机闹铃一样提供六个选项，固定 **Asia/Shanghai**。仅一次需选择未来日期和时间，其余选择一天中的执行时间。页面显示和对话时钟均为北京时间，与浏览器/服务器系统时区无关。交易报告在休市时说明最近交易日，不把最近报价当作当日交易。

  | 页面选项 | 接口规则 | 日期判定 |
  | --- | --- | --- |
  | 仅一次 | `once` + `runAt` | 指定的未来北京时间，仅触发一次 |
  | 每天 | `daily` | 每个自然日 |
  | 法定工作日 | `workday` | 中国大陆放假调休日历，跳过假期，包含周末补班日 |
  | 节假日及周末 | `holiday` | 日历中的放假日及普通周末，排除调休补班日 |
  | 单双休工作日 | `workweek` + `workweek=single/double` | 单休周一至周六；双休周一至周五，均按固定星期，不随调休变化 |
  | 自定义 | `custom` + `weekDays` | 周一至周日多选，1至7的不重复整数数组，不随调休变化 |

  所有重复规则还需`hour`与`minute`。旧`weekly`/`weekDay`接口继续兼容；页面编辑时显示为仅勾选该日的“自定义”，新对话任务也使用自定义星期。改单一规则会清除其他规则字段，重复创建的幂等比较包括自定义星期及单双休方式。
- 法定日历位于`ruoyi-system/src/main/resources/report-calendar/china-holidays.json`，按年度记录官方来源、完整放假区间和补班日；目前覆盖2026、2027年，依据国务院办公厅[2026年安排](https://www.beijing.gov.cn/zhengce/zhengcefagui/202511/t20251104_4258873.html)及[2027年安排](https://www.gov.cn/zhengce/content/202611/content_7085101.htm)。执行时使用本地资源，不依赖第三方日历API。每年官方安排公布后补充该JSON并部署重启Java；不得用推测日期或普通周末代替未知年度日历。跨入未配置年份时任务保持启用、`nextRunAt=null`并返回`scheduleMessage`，页面显示“待日历更新”，对话不得承诺按时执行。当前已到期且日历已知的最后一份报告仍可执行，不阻塞其他任务；更新日历后执行器会重新计算等待任务的未来计划，无需重建。`executionReady`仅表示执行器在线，判断后续自动执行还需检查`scheduleMessage`和`nextRunAt`。每天、单双休、自定义和仅一次不受年度日历覆盖限制。
- 网关每15秒领取一个任务，一次运行一份，与聊天会话池分离；执行中每30秒检查任务与权限并更新心跳。任务繁忙或数据源慢会延迟执行，不保证精确到秒。每次运行使用新的内存会话，默认模型与low思考强度沿用新聊天配置。
- 任务所有者从执行记录解析，执行前及每次业务读取重新检查账号状态、Agent/报告中心权限和对应股票权限。服务端固定白名单仅开放行情、K线、规则分析、自选/持仓列表及筛选快照；公开搜索由现有独立检索子代理完成。后台任务不能调用待办/任务管理子代理，不能新增持仓、自选或访问内部文件/终端。
- MySQL事务、行锁与唯一执行时段约束避免多个执行器重复领取；创建和手动生成使用请求标识幂等，编辑/删除检查版本，避免覆盖并发修改。页面和对话查询均按当前用户隔离，包括管理员也只查看自己的报告。
- 报告领取使用兼容MySQL 5.7/8.0的 `FOR UPDATE` 与READ COMMITTED短事务，提交后才运行模型；多个执行器可能短暂等待锁，不能重复领取同一份报告。遇到死锁或抢锁失败时，只在事务已回滚后重试领取，最多3次，不重试模型生成。所有领取分支均不使用 `SKIP LOCKED`。
- 停机错过的一次性任务在恢复后执行一次；周期任务合并错过的时段，生成一份报告后安排未来下一次，不逐次追赶。报告注明原计划和实际覆盖时间。失败不自动重试，周期任务保留下一次计划；可手动“立即生成”。
- 模型运行超过8分钟取消；运行租约10分钟。执行器中断留下的运行在下一次领取时标为失败。已提交完成而响应丢失时不重复提交。仅有失败记录时不能视为报告成功。
- 暂停和删除取消等待中或运行中的报告，后续数据请求及晚到的结果将拒绝。当前外部模型请求可能到终止/超时后才释放。编辑只影响下次运行；删除任务保留历史报告，删除报告不影响任务。
- 每个用户最多100个未删除任务；报告要求最多5000字符、正文最多20万字符；列表分页最多50条。任务与报告存于MySQL，按现有数据库备份策略保留。

## 接口与权限

`/agent/reports/tasks` 提供 GET/POST，`/tasks/{id}` 提供 GET/PUT/DELETE，`/tasks/{id}/status` 与 `/run` 提供 POST；`/agent/reports` 和 `/{id}` 提供报告列表、详情和删除。

权限分别为 `agent:report:list`、`agent:report:add`、`agent:report:edit`、`agent:report:remove`，全部还需 `agent:chat:use`。执行需要报告查看权限和所查询业务的原有权限。`agent:chat:manage` 不替代报告业务权限。

`/agent/report-worker/{claim,authorize,data,finish}` 是网关专用接口，使用共享密钥认证，不接受用户ID、任意HTTP代理或登录令牌。执行凭证仅在服务端异步上下文中传递，公开接口不返回租约或用户字段。

## 验证

### MySQL 5.7环境中报告一直等待生成

旧版领取SQL中的 `FOR UPDATE SKIP LOCKED` 会在MySQL 5.7报语法错误，导致每15秒一次领取事务全部回滚，
已保存任务与 `queued` 报告留在原处。新版改用上述兼容领取方式，无需升级数据库或删除重建任务。

1. 停Java和网关，备份数据库。工作区新版报告调度增加了字段，已有环境应先执行
   `sql/agent_reports_alarm_schedule.sql`（即使只需恢复旧任务，也不能省略新版Java需要的字段）。
2. 部署新版Java，保留服务器原配置和相同的 `AGENT_REPORT_WORKER_KEY`，再启动Java、网关。
3. 原来仍为enabled且已到期的任务、原有queued记录会在后续轮询中继续领取，无需再次点“立即生成”。
   若同一任务已存在queued/running报告，先消化该记录；到期的定时槽可能在后续轮询再生成一次，按实际状态核实。
4. 若日志仍失败，查看最后的错误：缺少列先核对步骤1；401或执行器离线检查共享密钥与服务；
   已进入failed状态的记录需查明详情后手动“立即生成”，不会自动重试。

```sql
SELECT task_id,title,status,next_run_at FROM agent_report_task
WHERE deleted=0 ORDER BY updated_at DESC LIMIT 20;
SELECT run_id,task_id,status,scheduled_at,started_at,finished_at,error FROM agent_report_run
ORDER BY scheduled_at DESC LIMIT 20;
```

时间字段是UTC毫秒。验收应看到原queued记录转为running再到succeeded且有正文，
Java/网关日志不再出现SKIP LOCKED语法错误；不要直接把数据库状态改成成功。

### 本地回归

```powershell
mvn -pl ruoyi-admin -am test '-Dtest=ReportScheduleTest,AgentReportServiceTest,AgentReportWorkerControllerTest' '-Dsurefire.failIfNoSpecifiedTests=false'
cd agent-gateway
pnpm --filter ./backend typecheck
pnpm --filter ./backend test
cd ../ruoyi-ui
npm run build:prod
npm run test:agent-report-schedule
```

Java使用隔离的H2 MySQL兼容数据库测试生命周期、所有权、幂等、版本冲突、取消、超时和并发领取，并直接验证执行器身份与只读路由；真实MySQL部署仍需按上面的短时任务验收。网关测试校验普通身份/后台租约隔离及只读工具限制，使用真实SDK配合本地模拟模型验证完整后台生成与完成回写。

`AgentReportMySqlTest`继承相同生命周期与并发测试，显式设置 `REPORT_TEST_MYSQL=1`、
`REPORT_TEST_MYSQL_URL`（例如 `jdbc:mysql://127.0.0.1:3306/{schema}?useSSL=false`）、
`REPORT_TEST_MYSQL_USER`、`REPORT_TEST_MYSQL_PASSWORD` 后运行。
测试账号需有创建/删除测试库的权限；每例只创建并清理随机命名的 `report_claim_test_*` 独立库，
不读写业务库。可分别连接真实MySQL 5.7与8.0验证，H2通过不能代替5.7部署验收。

`ruoyi-ui` 下运行 `npm run test:agent-reports:visual` 可对生产构建做隔离浏览器验收，需要可用的Playwright；可以用 `AGENT_BROWSER_MODULE` 指定模块路径，`AGENT_BROWSER_EXECUTABLE` 指定本机Chrome。测试使用模拟数据，不访问工作台记录，覆盖Agent侧栏、旧路由跳转、桌面/手机布局、子代理面板切换、草稿保留、深浅主题、权限、任务管理、分类、阅读和下载，并使用纽约浏览器时区核对北京时间。HTML下载会另开离线文件，检查表格、代码、内嵌图表、手机布局、来源链接和无外部网络依赖。

未配置执行器的回归覆盖：Java在空、缺失、过短密钥时仍按当前用户保存及修改任务；Agent不带执行器密钥也通过用户登录身份调用创建接口并保留执行就绪信息；侧栏保存成功但提示待执行，执行器就绪后同一条记录恢复正常显示。后台执行器的密钥/租约/用户权限校验继续由原测试覆盖。调度测试覆盖春节跳过、周末补班、跨年、2027年单日节假日、自定义多选、单双休、缺失日历等待与恢复、最后一个已知执行时段、幂等及旧每周规则；浏览器验收覆盖六种选项、星期必选、旧任务编辑、多选回显、深浅主题和手机宽度。
