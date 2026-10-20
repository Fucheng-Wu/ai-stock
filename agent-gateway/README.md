# Orange Workbench Agent Gateway

当前后端以上游 `pi-agent-gateway` 的 `main` 分支提交
`124d7a68b3a587361cf4d415bf1e8cd6af600682` 为基线，并在其上保留工作台所需的
MySQL 会话持久化扩展。详细同步说明见 `UPSTREAM.md`。

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
- `mcp.json`：MCP 服务。

项目专属技能和子 Agent 分别放在 `backend/skills` 与 `backend/subagents`。

## 会话持久化

MySQL 是工作台会话目录的主数据源。`agent_chat_session` 保存：

- 会话标题、创建时间、更新时间和消息数量；
- 模型 Provider、模型 ID 和思考强度；
- 完整原始消息、工具调用、思考内容和上下文用量；
- Pi JSONL 文件的完整备份。

网关首次连接数据库时，会把当前工作目录已有的 Pi JSONL 会话自动导入 MySQL。
如果本地 JSONL 丢失，加载会话时会从 MySQL 备份重建运行时文件并继续对话。

