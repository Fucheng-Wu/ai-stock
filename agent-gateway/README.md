# Orange Workbench Agent Gateway

当前后端以上游 `pi-agent-gateway` 的 `94d9d75` 为基础，选择性同步 `main` 分支
`18ab3ee28e278bf4c4308bf0208813e9a5f2e699` 中的协议校验、事件序号、慢客户端保护和
关闭流程改进。工作台保留 MySQL 用户会话隔离、登录身份校验和受限股票分析扩展。
Vue 2 页面适配上游的流式渲染节流、长工具输出预览，并使用工作台自己的浅色界面设计。
详细同步说明见 `UPSTREAM.md`。

这是 `orange的工作台` 内置的 Agent 后端，代码来自原
`pi-agent-gateway`，现已随 `ai-stock` 仓库统一维护。

## 目录

```text
agent-gateway/
├─ backend/           # Hono + WebSocket 服务
│  ├─ src/            # 会话、模型、事件和功能管理
│  ├─ skills/         # 项目级 Agent Skills
│  └─ subagents/      # 项目级子 Agent
├─ shared/types.ts    # WebSocket v1 协议类型
└─ package.json       # 网关启动入口
```

## 启动

先从模板创建本地配置，并填写与若依相同的 MySQL 连接信息：

```powershell
Copy-Item agent-gateway\.env.example agent-gateway\.env
```

`agent-gateway/.env` 已被 Git 忽略。首次运行：

```powershell
.\bin\start-agent-gateway.ps1 -Install
```

后续运行：

```powershell
.\bin\start-agent-gateway.ps1
```

Windows cmd 也可运行：

```cmd
bin\start-agent-gateway.cmd
```

Linux/macOS：

```sh
cd agent-gateway && pnpm install
./bin/start-agent-gateway.sh
```

启动脚本默认设置：

- `PI_WORKSPACE_DIR`：当前 `ai-stock` 仓库根目录；
- `PI_AGENT_DIR`：未指定时使用 `~/.pi/agent`；
- `HOST`：`127.0.0.1`；
- `PORT`：`3000`。

网关启动时会自动创建 `agent_chat_session` 表，也可以提前执行
`sql/agent_chat.sql`。MySQL 不可连接时网关会直接停止启动，避免会话只写本地文件。

浏览器不应直接连接 3000 端口。开发环境由 Vue 代理 `/agent-ws`，生产环境由 nginx
提供同源 WebSocket 反向代理，详情见 `docs/agent-chat-deployment.md`。

## 配置

Agent 会复用 `PI_AGENT_DIR` 下的：

- `models.json`：模型定义；
- `auth.json`：Provider 凭证；
- `settings.json`：Pi 设置；
- `sessions/`：Pi 运行时 JSONL；完整内容会同步备份到 MySQL；
- `mcp.json`：保留配置管理能力；当前普通 Agent 和两个子代理均不加载 MCP。

项目专属技能和子 Agent 分别放在 `backend/skills` 与 `backend/subagents`。

## 主 Agent、股票分析与信息检索子代理

主 Agent 固定为 `general`（普通 Agent），可以正常文字对话，唯一工具是 `Agent`，且只能
委派给 `stock-analyst`（股票行情与分析）或 `web-researcher`（各领域公开信息检索）。所有股票分析问题由股票子代理处理。新版不会提供上游的 Build、Plan
或全局自定义角色；旧会话和 MySQL 恢复的会话也统一使用此限制。

股票子代理配置在 `backend/subagents/stock-analyst/agent.md`，信息检索子代理配置在 `backend/subagents/web-researcher/agent.md`。

工具实现同样归属各自角色目录：`stock-analyst/tools.ts` 提供股票业务工具和本轮身份透传，
`web-researcher/web-search.ts` 提供联网搜索。`src/lib/feature-manager.ts` 创建子代理时显式导入并按角色挂载，
通用权限控制继续保留在 `src/lib`。

工具固定为：

- 股票子代理：`stock_search`、`stock_quote`、`stock_kline`、`stock_analyze`，复用 Java 股票服务；
- 信息检索子代理：仅 `web_search`，通过 Tavily 查询各领域公开网页，包括公告、行业和财经资讯。

混合任务由主 Agent 先检索，再将带来源、日期和不确定性的结果交给股票子代理分析。
股票子代理需要更多外部证据时向主 Agent 提出检索需求。两者不能相互调用。

两层代理均不提供文件、目录、代码检索、写入、编辑、终端、执行代码、MCP 等能力。
工具可见性与执行权限双重限制；修改配置中的 tools、extensions 或 skills 不能扩大权限。
全局扩展、技能、提示模板和项目 AGENTS.md 不会自动注入代理上下文。

聊天页在生成思考内容时自动展开并跟随最新内容；向上滚动可暂停跟随，手动收起后不会因
新增内容而展开。正文开始或本轮结束后自动收起，历史思考可手动展开。

权限协议兼容上游的 `action` 和 `patterns`，前端按队列展示操作对象与本会话授权范围。
本会话授权只在当前角色和会话内生效，可放行匹配的待确认操作；拒绝会取消该会话其余
待确认请求。明确禁止的操作不会被已记忆授权放行。当前普通 Agent 和两个子代理的
固定白名单仍优先生效，正常股票工具无需确认，内部操作直接拒绝。

`stock-520` 和 `web-research` 由服务端读取项目内指定文件，将正文分别注入股票和信息检索子代理，
因此无需给模型开放 `read`。主 Agent 不加载这些技能。子代理不继承聊天历史，主 Agent
委派时应带上必要上下文；子代理不再递归委派。停止生成会一并取消子代理和在途请求。

联网搜索配置（可选）：

```dotenv
TAVILY_API_KEY=填写服务端密钥
```

开发环境放在 `agent-gateway/.env`，生产环境放在 `config/agent-gateway.env`，修改后重启
网关。未配置时联网工具返回明确提示，股票业务工具仍可使用。接口说明见
[Tavily Search](https://docs.tavily.com/documentation/api-reference/endpoint/search)。
不要在聊天中发送密钥。股票工具沿用每轮的工作台登录身份，不使用 Tavily 密钥访问 Java。

## 会话持久化

MySQL 是工作台会话目录的主数据源。`agent_chat_session` 保存：

- 会话标题、创建时间、更新时间和消息数量；
- 模型 Provider、模型 ID 和思考强度；
- 完整原始消息、工具调用、思考内容和上下文用量；
- Pi JSONL 文件的完整备份。

网关首次连接数据库时，会把当前工作目录已有的 Pi JSONL 会话自动导入 MySQL。
如果本地 JSONL 丢失，加载会话时会从 MySQL 备份重建运行时文件并继续对话。

