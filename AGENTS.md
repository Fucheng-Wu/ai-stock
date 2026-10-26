# orange的工作台

基于 RuoYi-Vue 的个人工作台，统一入口集成多个功能菜单；520均线战法（股票分析）只是其中一个菜单。

## 菜单总览

| 菜单 | 类型与位置 | 状态 |
|---|---|---|
| 股票管理（520战法） | 内置页面，菜单 2000，order=5 | 已实现 |
| JupyterLab控制台 | 外链 iframe，菜单 2013，order=6 | 已部署 |
| 个人待办清单 | 内置页面，菜单 2014，order=7 | 已实现 |
| Agent助手 | 内置页面，菜单 2018，order=8 | 已实现 |

历史菜单 Hermes控制台（2011）、Pi控制台（2012）已隐藏（visible='1'），终端能力统一由 JupyterLab 提供。


## 技能使用约束

- 不要调用或遵循任何 Superpowers 技能（包括 `using-superpowers`、`brainstorming`、`test-driven-development`、`systematic-debugging`、`writing-plans` 等来自 `obra/superpowers` 的技能）。
- 即使 Superpowers 技能已在全局安装或出现在可用技能列表中，也应忽略它们。

## 菜单一：股票管理（520均线战法）

将 `stock_520_analyzer.py` 的功能嵌入 RuoYi-Vue 项目，实现 Web 化的股票 AI 分析，是工作台的内置菜单之一。

### 后端

| 层 | 文件 | 说明 |
|---|---|---|
| Controller | `ruoyi-admin/.../controller/stock/StockAnalyzerController.java` | POST `/stock/analyzer/analyze` |
| Service | `ruoyi-system/.../service/IStockAnalyzerService.java` | 服务接口 |
| ServiceImpl | `ruoyi-system/.../service/impl/StockAnalyzerServiceImpl.java` | 核心逻辑：数据获取、均线计算、信号检测、AI分析 |
| Domain | `ruoyi-system/.../domain/stock/StockRealtimeData.java` | 实时股票数据模型 |
| Domain | `ruoyi-system/.../domain/stock/AnalysisSignal.java` | 交易信号模型 |
| Domain | `ruoyi-system/.../domain/stock/StockAnalysisResult.java` | 分析结果聚合模型 |
| Config | `ruoyi-framework/.../config/RestTemplateConfig.java` | RestTemplate Bean (15s连接, 60s读取超时) |

### 前端

| 文件 | 说明 |
|---|---|
| `ruoyi-ui/src/api/stock/analyzer.js` | API 封装 |
| `ruoyi-ui/src/views/stock/analyzer/index.vue` | 分析页面（输入股票代码 → 展示可视化报告） |

### 数据流

```
用户输入股票代码 → 前端POST请求
  → 后端调用腾讯接口获取实时行情（GBK编码）
  → 后端调用新浪接口获取K线数据（JSON）
  → 计算MA5/MA20均线 → 检测金叉/死叉/回踩/粘合信号
  → （可选）调用DeepSeek API进行AI分析
  → 返回结构化结果 → 前端渲染可视化报告
```

### 配置

在 `application.yml` 中新增:
```yaml
deepseek:
  api-key: sk-xxx  # DeepSeek API Key
  base-url: https://api.deepseek.com/v1/chat/completions
```

### 启动前操作

1. 执行 `sql/stock_menu.sql` 添加股票管理菜单权限（或在系统管理-菜单管理手动添加）
2. 确保 DeepSeek API Key 配置正确（不配置则跳过AI分析，仅展示技术指标）

### 子菜单与权限

- 目录: 股票管理 (menu 2000, order=5)
- 页面: AI分析报告 (2001) → `/stock/analyzer`；我的自选 (2003) → `/stock/watchlist`；我的持仓 (2006) → `/stock/position`
- 权限标识: `stock:analyzer:analyze`、`stock:watchlist:*`、`stock:position:*`

## 菜单二：JupyterLab控制台

- 集成方式：外链 iframe 菜单（`menu_type='M'`，`parent_id=0`，order=6，`is_frame=1`），指向 `https://orangespark.site/lab/auth/<token>`。
- 后端服务：本机 systemd `jupyterlab.service` 运行 Python venv 中的 JupyterLab；nginx 反向代理 `/lab/`，Token 强认证。
- 菜单 SQL：部署环境的 `sql/jupyterlab_menu.sql`（含 Token，文件权限 0600，不要提交到 Git）。
- 仅授权管理员角色（role_id=1 超管、4 超管）。
- 该菜单是工作台终端能力的统一入口（替代历史 Hermes/Pi 控制台）。

## 菜单三：个人待办清单

- 目标：只记录待办内容和分类（工作/学习/生活），支持增删改查与完成状态切换，无日期、无提醒。
- 分类为前端常量（`ruoyi-ui/src/views/todo/index.vue` 的 `CATEGORIES`），数据库按字符串存储，增删分类只需改此前端常量。
- SQL：`sql/todo_menu.sql`（建表 `todo_task` + 菜单 2014 页面、2015/2016/2017 按钮权限，可重复执行）。
- 后端：`ruoyi-admin/.../controller/todo/TodoTaskController.java`（`/todo/task` list/add/update/delete）、`ruoyi-system/.../service/ITodoTaskService.java`、`impl/TodoTaskServiceImpl.java`、`domain/todo/TodoTask.java`、`mapper/todo/TodoTaskMapper.java`、`resources/mapper/todo/TodoTaskMapper.xml`。
- 前端：`ruoyi-ui/src/api/todo/task.js`、`ruoyi-ui/src/views/todo/index.vue`。
- 权限标识：`todo:task:list`、`todo:task:add`、`todo:task:edit`、`todo:task:remove`。

## 菜单四：Agent助手

- 页面：`ruoyi-ui/src/views/agent/chat/index.vue`，提供多会话、流式回复、停止生成、思考过程和工具调用展示。同一轮直到 `agent_end` 才结束流式气泡，不能在中间 `message_end` 清空流式消息 ID；工具结果按调用 ID 回写。
- 富文本：`ruoyi-ui/src/views/agent/chat/components/AgentMarkdown.vue` 使用 `markdown-it`，代码高亮/复制由 `AgentCodeBlock.vue` 提供，顶层 `echarts` JSON 围栏由 `AgentEchart.vue` 渲染为可预览、查看配置和下载的图表；输出约定在 `agent-gateway/backend/src/lib/response-format.ts`。
- 页面样式集中在同目录的 `chat.scss`，工具卡片为 `AgentToolCard.vue`；Markdown流式渲染每60毫秒合并，长工具输出默认预览末尾12,000字。已选择性同步上游 `f3afb9c`，记录见 `agent-gateway/UPSTREAM.md`；事件按 `epoch/sequence` 去重和重新同步，保持现有用户隔离和角色限制。
- 图像问答：支持上传、粘贴、拖拽 PNG/JPEG/GIF/WebP，最多4张、每张5 MiB，可仅发送图片；输入框下方提供模型、思考强度和上下文工具栏。需选择标有“图像”的模型，前后端均校验能力。图片随 MySQL/JSONL 历史保存，本轮图片自动传给所调用的子代理并在子代理面板展示；未发送图片草稿仅在页面内存按用户/会话隔离，刷新需重新选择。
- 子代理实时过程：`AgentSubagentPanel.vue` 展示股票分析或信息检索子代理的思考、工具和回复，桌面分屏、手机覆盖显示；`AgentToolGroup.vue` 折叠工具组。进度每80毫秒合并，通过现有工具进度快照恢复，最终过程随 Agent 工具结果保存在 MySQL/JSONL；旧调用可查看原始结果。
- 主题：Agent 页右上角支持深浅主题切换，偏好以 `orange-agent-theme` 保存在 localStorage；`theme.scss` 只作用于聊天页和其权限弹窗，Markdown、代码、工具、子代理与图表同步切换。`agent-chat-scroll.js` 在用户上滚后暂停跟随，点击回到最新后恢复，内容增长不重置阅读位置。
- 后端：`agent-gateway/backend`，基于 Hono、WebSocket 和 `@earendil-works/pi-coding-agent`，源码与项目一同维护和启动。
- 共享协议：`agent-gateway/shared/types.ts`，前后端使用 WebSocket v1 消息协议。
- 会话持久化：`agent-gateway/backend/src/lib/database.ts` 将完整消息、JSONL 备份、模型、思考强度和上下文用量按若依用户保存到 MySQL；无所属用户的旧记录不自动导入或展示，JSONL 丢失时可从数据库重建。列表每页30条、历史每页40条，查看历史不占用运行会话名额。
- 数据表：`sql/agent_chat.sql` 创建 `agent_chat_session`；连接参数位于 `agent-gateway/.env`（模板为 `.env.example`）。
- 启动：首次使用 `.\bin\start-agent-gateway.ps1 -Install`，后续使用 `.\bin\start-agent-gateway.ps1`；默认 Agent 工作目录为本仓库根目录。
- 协议：直接使用 `pi-agent-gateway` 的 WebSocket v1 协议；前端默认连接同源 `/agent-ws`。
- 开发代理：`ruoyi-ui/vue.config.js` 将 `/agent-ws` 转发到 `http://127.0.0.1:3000/ws`。
- 生产部署：nginx 反代与安全注意事项见 `docs/agent-chat-deployment.md`。
- 菜单 SQL：`sql/agent_chat_menu.sql`（菜单 2018，order=8），默认只授权角色 1、4。
- 权限标识：`agent:chat:use` 用于聊天，`agent:chat:manage` 单独控制模型、认证、技能、插件和 MCP 配置管理（按钮菜单2019）；均由网关在执行命令前校验。草稿按用户及会话保存在 sessionStorage；流式事件合并刷新，页面缓存最多8个会话、每个会话最多120条可见消息。
- 主 Agent 固定为 `general`（普通 Agent），唯一工具为 `Agent`，只能调用 `stock-analyst` 股票子代理或 `web-researcher` 信息检索子代理；股票行情与分析必须委派给前者，各领域公开信息检索、新闻和来源核实委派给后者。混合任务先检索，再将带来源、日期与不确定性的资料交给股票子代理分析；需要补充证据时由主 Agent 协调。其他问题可正常文字回答。旧会话和 MySQL 恢复也统一使用受限角色，不提供 Build/Plan 或全局自定义角色。
- 工具限制：`agent-gateway/backend/src/lib/agent-policy.ts` 定义精确白名单，`permissions.ts` 在执行时再次检查。两层代理均禁止内部文件/目录/代码查询、写入、编辑、终端、执行代码和 MCP；不自动加载全局扩展、技能、提示模板或项目上下文。角色文件不能扩大权限，子代理不能递归委派。
- 股票子代理：`agent-gateway/backend/subagents/stock-analyst/agent.md`，专属回答股票、ETF、证券知识、行情和520战法，不直接联网检索；可解读主 Agent 提供的外部证据，需要补充资讯时向主 Agent 提出检索需求。同目录的 `tools.ts` 为其注册 `stock_search`、`stock_quote`、`stock_kline`、`stock_analyze`，通过 `STOCK_API_BASE_URL` 复用 Java 服务；按每轮 prompt 透传当前用户登录身份，不将令牌写入模型上下文或会话数据库，权限沿用 `stock:analyzer:analyze`。名称提问先搜索，只有唯一精确匹配才自动分析，否则让用户确认候选。
- 子代理技能：`agent-gateway/backend/skills/stock-520/SKILL.md` 仅注入股票子代理，负责三步分析流程与证据解读，数值和规则判定仍由 Java 引擎提供；`web-research/SKILL.md` 仅注入信息检索子代理，负责各领域公开资料、时效核实与来源引用。服务端直接注入指定技能正文，无需开放 `read`。股票工具仅提供公开行情和分析，不包含自选或持仓操作。
- 信息检索：`agent-gateway/backend/subagents/web-researcher/agent.md` 定义独立信息检索子代理，同目录 `web-search.ts` 仅为其提供 `web_search`，使用 Tavily 固定接口，服务端配置 `TAVILY_API_KEY`；未配置时仅搜索不可用，不影响股票业务工具。两子代理的工具、技能与执行权限精确隔离，可在管理页分别启停，均不能相互或递归委派。
- Agent 新会话默认使用 DeepSeek（`deepseek-flash`），可通过网关 `AGENT_DEFAULT_MODEL` 指定 `deepseek` Provider 下的已配置型号；认证使用网关 `DEEPSEEK_API_KEY` 或 Agent 设置页，不自动读取 Java 股票分析服务的 Key。
