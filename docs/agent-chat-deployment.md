# Agent 助手部署说明

Agent 助手页面通过 Pi Agent Gateway 的 WebSocket v1 协议通信。网关后端已经作为
当前仓库的一部分放在：

```text
agent-gateway/
```

它不再依赖 `C:\Users\orange\Desktop\study\pi\pi-agent-gateway`。开发环境默认将
`/agent-ws` 转发到本项目启动的 `http://127.0.0.1:3000/ws`。

## 开发环境

复制配置模板并填写 MySQL 信息：

```powershell
Copy-Item agent-gateway\.env.example agent-gateway\.env
```

数据库默认与若依共用 `ai_stock`。网关会自动创建会话表，也可以手动执行：

```text
sql/agent_chat.sql
```

首次运行，在仓库根目录安装依赖并启动：

```powershell
.\bin\start-agent-gateway.ps1 -Install
```

后续启动可以使用：

```powershell
.\bin\start-agent-gateway.ps1
```

也可以使用 `bin\start-agent-gateway.cmd`。启动脚本默认把 `PI_WORKSPACE_DIR` 设置为
当前 `ai-stock` 仓库根目录，作为会话工作目录标识。普通 Agent 与三个子代理均不开放
文件和终端工具；改动工作目录不会扩大工具权限。需要改为其他目录时，可在启动前
显式设置该环境变量。

工作台的 `vue.config.js` 已包含 WebSocket 开发代理，无需在浏览器中跨域连接 3000
端口。

## 默认模型

新会话默认使用 DeepSeek Flash，型号为 `deepseek-flash`。可在网关环境配置中通过 `AGENT_DEFAULT_MODEL` 指定 `deepseek` Provider
下已配置的其他模型 ID。默认型号不存在时会提示配置错误。

新会话思考强度默认 `low`，不会继承全局高强度默认值，实际能力仍受模型配置约束。
输入框不显示角色、模型、思考强度或上下文占比模块；图片上传位于框内左下角。
已保存会话仍按原模型与思考强度恢复。

在 `agent-gateway/.env` 中填写 `DEEPSEEK_API_KEY`，或从 Agent 设置页配置 DeepSeek
Provider 的认证。未配置认证时仍可创建会话，发送消息会提示先配置 Provider 认证。
Java 股票分析服务中的 DeepSeek Key 与网关配置独立，需要分别配置。

生产环境对应配置文件为 `config/agent-gateway.env`。修改环境变量后重启网关，新建
会话使用新的默认值；已有会话恢复已保存的模型和思考配置，输入框不再提供切换控件。

## 生产环境

推荐将 `agent-gateway` 作为独立的 systemd 服务运行，但源码、依赖声明和资源配置均
保留在本仓库中。服务的关键配置如下：

```ini
[Service]
WorkingDirectory=/home/wufc/ai-stock/agent-gateway
Environment=PI_WORKSPACE_DIR=/home/wufc/ai-stock/workspace
Environment=PI_AGENT_DIR=/home/wufc/.pi/agent
Environment=HOST=127.0.0.1
Environment=PORT=3000
Environment=AGENT_DB_HOST=127.0.0.1
Environment=AGENT_DB_PORT=3306
Environment=AGENT_DB_NAME=ai_stock
Environment=AGENT_DB_USER=agent_gateway
Environment=AGENT_DB_PASSWORD=替换为真实密码
ExecStart=/usr/bin/pnpm start
Restart=on-failure
```

完整的生产配置、systemd 和 Nginx 模板位于 `deploy/`，打包与服务器部署步骤见
`deploy/README.md`。

生产环境建议为 Agent Gateway 创建只对 `agent_chat_session` 表拥有增删改查权限的
独立 MySQL 账号，不要复用 root。

## 会话用户隔离升级

会话归属由若依登录身份确定。前端在 WebSocket `init` 中发送 `accessToken`，网关访问
`STOCK_API_BASE_URL/getInfo` 校验令牌和 `agent:chat:use` 权限，使用服务端返回的用户 ID，
不接受客户端指定所属用户。后续命令和心跳会重新校验登录状态。股票工具使用同一连接
已校验的令牌，不再采用 `prompt` 中单独传入的身份。

列表、历史读取、删除、停止生成、模型设置以及流式事件均按所属用户隔离；即使知道其他
用户的会话 ID，也不能访问。新 JSONL 文件存入用户独立子目录；退出或切换账号时，页面
会清空内存中的历史和消息。模型 Provider、密钥和功能设置仍属于网关服务配置。

已有部署应在重启新版网关之前，由数据库管理员在若依数据库中执行：

```text
sql/agent_chat_user_isolation.sql
```

迁移只增加 `user_id` 和查询索引，不删除旧数据；可重复执行。网关也会在缺少该列时尝试
自动升级，但日常数据库账号没有 ALTER 权限时会停止启动并提示执行上述 SQL。

旧版本只记录工作目录，没有可靠的所属用户信息。升级后这些记录的 `user_id` 保持 NULL，
不会向任何账号展示，也不会继续自动导入公共目录中的旧 JSONL。不要把全部旧记录自动分配
给第一个登录者或管理员。只有人工确认某条记录的真实归属后，才可由数据库管理员设置其
`user_id`；旧文件不在该用户目录时，网关会优先使用数据库中的 JSONL/消息备份重建。

需要同时更新前端和网关，旧版未携带握手令牌的客户端无法连接。确保
`STOCK_API_BASE_URL` 指向可访问的若依后端；即使只使用普通聊天，也需要该服务校验身份。

Pi SDK 会在首条聊天消息写入时才创建本地 JSONL 文件。网关保存到 MySQL 的 JSONL
备份直接由 SDK 内存中的会话头和完整条目生成，空会话也可保存模型、思考强度等配置，
不依赖本地文件已经存在。恢复时仍可使用该备份重建本地文件。

在承载工作台的 nginx `server` 中加入同源 WebSocket 反向代理：

```nginx
location /agent-ws {
    proxy_pass http://127.0.0.1:3000/ws;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;

    # 当前 Pi Agent Gateway 只接受本机 Origin；由反代统一改写。
    proxy_set_header Origin http://127.0.0.1:3000;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

如果部署路径不同，可在构建工作台前通过 `VUE_APP_AGENT_WS_URL` 指定相对路径或完整
的 `ws://` / `wss://` 地址。

## 页面交互与管理权限

2026-10-25 已参考上游 `18ab3ee` 同步可靠性改进。WebSocket v1 新增可选 `epoch`、
`sequence` 及普通命令 `ack`；前端检测到重复事件会跳过，发现缺失事件或会话实例变化时，
先同步快照再回放后续事件。快照包含正在生成的正文和工具进度。发送消息仍以持久化之后的
`prompt_accepted` 为确认，不因为普通命令确认而提前认为问题已送达。

所有命令在进入处理函数前进行字段、长度和枚举校验，非法请求错误保留有效 requestId。
单个客户端的待发送缓冲超过8 MiB时，网关以1013关闭连接，让页面重连同步；关闭网关时
先并行取消任务，最多等待5秒后继续保存会话。股票助手不增加上游的目录浏览、工作区切换
或文件变更审阅能力。详细取舍记录在 `agent-gateway/UPSTREAM.md`。

会话列表按30条分页，标题搜索在服务端按当前用户过滤，并支持重命名和“今天／近七天／更早”分组。
历史消息每次读取40条；页面最多保留120条消息，向前翻阅超过窗口后可点击“回到最新消息”。
查看历史只读取数据库或已有内存快照，不创建新的 SDK 实例。页面最多缓存8个会话，优先释放闲置会话。
流式文本和工具进度按40毫秒合并刷新；工具默认展示任务摘要、数据来源或结果摘要及耗时，详细参数可展开查看。
正文 Markdown 最多每60毫秒更新一次，回复结束时立即刷新最终内容。展开工具详情默认只显示
输出末尾12,000字，可手动查看完整输出。界面采用 DeepSeek 风格的纯白背景、浅灰侧栏、蓝色重点色和淡蓝用户气泡，统一中文排版、
表格、思考面板和代码块；移动端使用可关闭的会话抽屉，会话重命名与删除按钮分别排布。

除 `npm run test:agent-chat` 的回归测试外，可在前端构建后运行 `npm run test:agent-chat:visual`。
该检查需要已安装的 Playwright（可用 `AGENT_BROWSER_MODULE` 指定模块路径），并可通过
`AGENT_BROWSER_EXECUTABLE` 指定本机浏览器、`AGENT_UI_SCREENSHOTS` 指定截图目录。
检查使用隔离的预览身份和模拟接口，不访问真实账户或行情服务；默认截图保存在系统临时目录。

页面区分连接、身份验证、服务暂不可用、登录失效和无访问权限。普通请求有15秒超时，发送消息等待
服务端确认的超时为20秒。发送被明确拒绝时可重试；断线或确认超时导致结果不确定时，不自动重发，
恢复连接后同步历史，用户可取回原问题继续编辑。恢复窗口焦点时也会同步当前会话，避免后台页错过事件。
执行中显示等待、思考、工具调用、生成回答等阶段与总耗时；停止生成期间避免重复提交停止请求。

草稿存放在当前浏览器标签页的 sessionStorage，按若依用户ID和会话ID分别保存，不包含登录令牌。
发送消息在收到服务端确认之前仍保留问题草稿。刷新或暂时断线可恢复草稿；切换账号清空当前页面状态，
新账号不会读取前一账号的草稿。

普通聊天权限为 `agent:chat:use`。读取或修改模型配置、Provider 认证、技能、插件、子代理设置和
MCP 配置必须另外具备 `agent:chat:manage`，在每个 WebSocket 命令执行前由服务端校验。
普通用户的握手响应不会包含网关功能配置；超级管理员的 `*:*:*` 权限继续有效。

已有部署请在选中若依数据库后重新执行可重复运行的 `sql/agent_chat_menu.sql`，增加按钮权限
“Agent管理”（2019），默认授权角色1、4。只有聊天权限的角色无需管理权限即可继续聊天。
此次页面升级不新增会话表字段；之前的 `user_id` 隔离迁移仍需完成。前端与网关应同步更新。

## 股票分析、信息检索与专属技能

主 Agent 固定为“普通 Agent”（`general`），唯一工具为 `Agent`，且只能调用
`stock-analyst` 股票分析、`web-researcher` 信息检索或 `stock-screener` 全市场选股子代理。
具体标的行情与分析交给股票分析角色，公开资料交给信息检索角色，全市场520候选和快照证据交给选股角色；其他问题可以正常文字对话。
旧会话、JSONL 和 MySQL 备份恢复的会话也使用同一角色，不能切换到上游 Build/Plan
或通过自定义角色放开权限。

股票子代理内置以下只读业务工具，复用 Java 股票分析服务：

工具代码位于 `agent-gateway/backend/subagents/stock-analyst/tools.ts`；联网搜索代码位于
`agent-gateway/backend/subagents/web-researcher/web-search.ts`；选股工具位于
`agent-gateway/backend/subagents/stock-screener/tools.ts`。网关通过固定导入按角色挂载工具，部署时需要包含三个子代理目录。

| 工具 | 用途 | 后端接口 |
| --- | --- | --- |
| `stock_search` | 按名称、简称或代码检索沪深股票、ETF、指数候选 | `GET /stock/analyzer/search?keyword=西藏珠峰` |
| `stock_quote` | 最新行情、涨跌幅、成交量额 | `GET /stock/analyzer/quote/{stockCode}` |
| `stock_kline` | 最近1～60根日K线及MA5/MA10/MA20 | `GET /stock/analyzer/kline/{stockCode}?limit=30` |
| `stock_analyze` | 行情、指标、520结构化规则报告，不重复调用DeepSeek | `POST /stock/analyzer/analyze`，`includeAi=false` |
| `stock_screen` | 查询全市场520候选，按买点/交易所/ST/名称筛选及分页 | 调用 `/stock/screener/results` 读取MySQL，沿用登录与股票权限 |
| `stock_screen_detail` | 同一快照的逐只完整证据，包括未命中和排除原因 | 调用 `/stock/screener/detail` 读取MySQL，沿用登录与股票权限 |

配置 `agent-gateway/.env`（生产环境为 `config/agent-gateway.env`）：

```dotenv
STOCK_API_BASE_URL=http://127.0.0.1:8080
```

该地址指向若依后端，可以包含实际的 servlet context-path，不能填写前端代理前缀
`/dev-api` 或 `/prod-api`。默认值为 `http://127.0.0.1:8080`，无需安装新依赖或新增菜单 SQL。

页面在 `init` 握手时附带当前登录令牌 `accessToken`。网关校验身份后，在本轮异步工具调用中
将连接令牌作为 `Authorization: Bearer ...` 透传，不加入模型提示、工具参数、工具结果或会话存储。
Java 接口继续校验 `stock:analyzer:analyze` 权限。不配置静态管理员 Token；旧客户端必须
更新以支持登录握手。生产环境的浏览器连接应使用 HTTPS/WSS。

`backend/skills/stock-520/SKILL.md` 的正文由网关直接注入股票子代理，组织“趋势 → 买点 → 执行与仓位”
分析流程，调用 `stock_analyze` 取得规则和证据，由股票子代理进行解读。规则数值和判定
仍以 Java 引擎为准，Skill 不复制实现一套计算逻辑。首批不包含自选、持仓查询或修改操作。

`backend/skills/web-research/SKILL.md` 仅注入信息检索子代理，指导其使用唯一工具 `web_search`
检索各领域公开信息、区分事件日期和查询时间、提供来源链接。股票子代理不再注册联网工具。
混合任务由主 Agent 先检索，再把用户问题、来源、日期和不确定性一起交给股票子代理分析；
需要补充证据时由主 Agent 继续协调。联网搜索使用固定的 Tavily HTTPS 搜索接口，不提供任意 URL 抓取
或内部 HTTP 查询。在同一网关环境配置中填写：

```dotenv
TAVILY_API_KEY=填写Tavily密钥
```

修改后重启网关。未配置时搜索会报告缺少服务端配置，不影响 Java 股票工具。不要在聊天
中提供密钥。搜索只发送公开关键词，不发送工作台 Token 或模型认证信息。

两层代理均禁止 `read`、`grep`、`find`、`ls`、`write`、`edit`、`bash`、执行代码等内部
工具，并关闭全局扩展、MCP、项目上下文和提示模板的自动加载。工具权限由后端精确
白名单限制，不能通过修改角色文件或页面设置扩大。股票技能已加载在系统提示中，无需
也不能让代理读取文件。主 Agent 不直接调用股票、选股或搜索工具，三个子代理不能相互或递归委派。
管理页分别控制三个角色的启停，运行时配置文件仍为 `backend/subagents/settings.json`。

全市场选股通过 `STOCK_API_BASE_URL` 调用 Java 鉴权接口读取 MySQL，接口失败不回退到本地文件。
若依每天北京时间16点采集全市场双口径日线、17点筛选并保存完整规则证据，休市或采集失败不发布当日结果。
首次升级先迁移六张业务表及 sys_job.time_zone，再导入旧SQLite和结果，最后启动新版Java与网关。
步骤见 `docs/deploy-stock-screener.md`，`STOCK_SCREEN_DATA_DIR` 已不用于正式查询。
工具保持实际行情日期和 snapshotId，不把旧日线候选当作当天实时信号。

更新并重启网关后，在新会话中可以提问：

- “查一下 600519 的最新行情。”
- “看看 sz000001 最近30天的日K线和均线。”
- “检索最近的人工智能公开新闻并给出来源。”
- “查一下贵州茅台最近的公告，结合520战法分析。”
- “用520战法分析 510300，说明趋势、买点和判断依据。”
- “分析西藏珠峰。”（先检索名称，唯一精确匹配后自动继续分析）

名称搜索只在唯一精确匹配时自动确定标的；模糊匹配或同名结果会列出候选，用户确认
后再分析。搜索工具不返回行情，后续的行情和规则分析仍使用明确的市场前缀代码。

也可显式输入 `/skill:stock-520 分析600519`。更新前已加载的会话可在空闲时从设置页触发
资源重载，或新建会话。工具返回来源和查询时间，行情及K线自身的时间应分别解读。

## 子代理过程与主题

Agent 工具卡片的“查看子代理实时过程/对话”按钮可打开对应子代理面板，展示其思考、
工具执行与回答；桌面并排显示，手机覆盖主对话，关闭后回到主对话。多个调用可在面板
顶部切换。旧记录没有详细过程时仍可查看最终结果。

子代理过程通过现有 WebSocket 消息的可选 `subagent` 字段传输，最终附在 Agent 工具
结果内，沿用现有 MySQL/JSONL 备份恢复，无需新增数据表。更新时应同时发布前端构建
并重启 Agent 网关；此前已运行的网关会话不会自动生成旧子代理的详细过程。

右上角月亮/太阳按钮切换聊天页深浅主题，刷新后保留选择。主题只影响 Agent 页面及其
权限弹窗，工具、代码、Markdown 和图表同步适配；图表显式指定背景色时保留该配置。
主对话和子代理面板各自跟随新内容，上滚后暂停跟随，点击“回到最新”恢复。

## 图像问答与输入框

已选择性同步上游 `f3afb9c`。输入框支持上传、粘贴及拖入 PNG/JPEG/GIF/WebP，
每条消息最多4张、每张5 MiB，也可以仅发送图片。缩略图可移除或点击放大；发送按钮
位于输入框右下角，附件、模型、思考强度和上下文信息位于下方工具栏。

先在模型下拉框选择带“图像”标识的模型。标识来自模型注册表的 `input` 能力；
自定义模型需在其模型配置中声明 `"input": ["text", "image"]`，并确保服务商实际支持。
未选择模型时新会话仍沿用 DeepSeek 默认设置；文本模型会明确拒绝图片，保留草稿供切换。
选择模型和思考强度只调整当前会话，不改变角色或工具权限。

股票问题的本轮图片由服务端随任务交给 `stock-analyst`，子代理面板展示相同图片，
无需开放文件读取能力。图片随完整会话记录存入现有 MySQL/JSONL，重连和历史恢复可回看。
未发送的图片草稿只保存在当前页面内存，按登录用户及会话隔离，刷新后需重新选择；
文字草稿仍使用 sessionStorage。

前后端需一同更新，发布前端构建并重启 Agent 网关。WebSocket 入站上限已调整为
32 MiB、出站积压阈值64 MiB，应用仍按单图5 MiB/最多4张校验。数据库字段已是
LONGTEXT，无需改表；长图片会话会增大会话备份和数据库写入，请按实际会话大小为
MySQL 的 `max_allowed_packet` 留足余量（一次写入包含 JSONL 与消息 JSON 两份数据）。

## 回复合并与富文本展示

一次用户提问对应一条持续更新的 Agent 回复：模型调用工具后发出的中间 `message_end`
只更新该条回复，直到整轮 `agent_end` 才结束。工具结果按调用 ID 回写，正文段落在多次
模型输出之间保留空行。刷新或载入历史时，后端使用相同的合并规则。

聊天内容使用 `markdown-it` 解析，支持标题、表格、嵌套列表、任务列表、引用、分隔线、
链接、图片和代码块；代码块提供语法高亮与复制，宽表格及代码在自身区域横向滚动。
前端依赖声明和锁文件已加入 `markdown-it`，更新部署时需要同步安装前端依赖。
本项目使用 Vue CLI 4 / Webpack 4，Markdown 解析显式引用
`markdown-it/dist/markdown-it.js` 浏览器打包入口，避免直接解析新版 `.mjs` 源码引发
ESM/CommonJS 命名导出及新语法兼容问题；调整依赖时应保留这一兼容入口。

顶层的 `echarts` 或 `echart` 代码围栏会渲染成交互图表，内容为严格 JSON 格式的
ECharts option，例如：

````markdown
```echarts
{
  "tooltip": { "trigger": "axis" },
  "xAxis": { "type": "category", "data": ["周一", "周二", "周三"] },
  "yAxis": { "type": "value" },
  "series": [{ "name": "示例数据", "type": "line", "data": [12, 15, 14] }]
}
```
````

图表提供预览、配置查看/复制和 PNG 下载，随会话容器大小变化调整尺寸；切换或删除
会话时释放实例。生成中的不完整围栏显示等待状态，配置错误时展示原文。普通 `json`
围栏保留为代码，不会误识别为图表。渲染只解析 JSON，不执行模型生成的 JavaScript。
网关的 `response-format.ts` 已向模型说明输出约定，新建会话或重载资源后生效。

## 安全提示

当前工作台的 Agent 工具已由后端白名单限制，WebSocket 还会校验若依登录身份和
`agent:chat:use` 权限。菜单可见性不能替代网关鉴权。让网关只监听 `127.0.0.1`，通过
nginx 的同源 `/agent-ws` 提供 HTTPS/WSS 连接，不直接把 3000 端口开放到公网。
菜单 SQL 默认只把页面授权给角色 1 和 4。

