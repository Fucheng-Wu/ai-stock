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
当前 `ai-stock` 仓库根目录，作为会话工作目录标识。普通 Agent 与股票子代理均不开放
文件和终端工具；改动工作目录不会扩大工具权限。需要改为其他目录时，可在启动前
显式设置该环境变量。

工作台的 `vue.config.js` 已包含 WebSocket 开发代理，无需在浏览器中跨域连接 3000
端口。

## 默认模型

新会话默认使用 DeepSeek，型号默认为 `deepseek-v4-pro`（当前 Pi SDK 的 DeepSeek
默认型号）。可在网关环境配置中通过 `AGENT_DEFAULT_MODEL` 指定 `deepseek` Provider
下已配置的其他模型 ID。默认型号不存在时会提示配置错误。

在 `agent-gateway/.env` 中填写 `DEEPSEEK_API_KEY`，或从 Agent 设置页配置 DeepSeek
Provider 的认证。未配置认证时仍可创建会话，发送消息会提示先配置 Provider 认证。
Java 股票分析服务中的 DeepSeek Key 与网关配置独立，需要分别配置。

生产环境对应配置文件为 `config/agent-gateway.env`。修改环境变量后重启网关，新建
会话使用新的默认值；已有会话恢复已保存的模型，也可以在页面手动切换当前会话模型。

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

## 股票工具与 520 战法技能

主 Agent 固定为“普通 Agent”（`general`），唯一工具为 `Agent`，且只能调用
`stock-analyst` 股票子代理。股票问题必须委派；其他问题可以正常文字对话。
旧会话、JSONL 和 MySQL 备份恢复的会话也使用同一角色，不能切换到上游 Build/Plan
或通过自定义角色放开权限。

股票子代理内置以下只读业务工具，复用 Java 股票分析服务：

工具代码位于 `agent-gateway/backend/subagents/stock-analyst/tools.ts`；联网搜索代码位于
同目录的 `web-search.ts`。网关通过固定导入挂载工具，部署时需要包含该子代理目录。

| 工具 | 用途 | 后端接口 |
| --- | --- | --- |
| `stock_search` | 按名称、简称或代码检索沪深股票、ETF、指数候选 | `GET /stock/analyzer/search?keyword=西藏珠峰` |
| `stock_quote` | 最新行情、涨跌幅、成交量额 | `GET /stock/analyzer/quote/{stockCode}` |
| `stock_kline` | 最近1～60根日K线及MA5/MA10/MA20 | `GET /stock/analyzer/kline/{stockCode}?limit=30` |
| `stock_analyze` | 行情、指标、520结构化规则报告，不重复调用DeepSeek | `POST /stock/analyzer/analyze`，`includeAi=false` |

配置 `agent-gateway/.env`（生产环境为 `config/agent-gateway.env`）：

```dotenv
STOCK_API_BASE_URL=http://127.0.0.1:8080
```

该地址指向若依后端，可以包含实际的 servlet context-path，不能填写前端代理前缀
`/dev-api` 或 `/prod-api`。默认值为 `http://127.0.0.1:8080`，无需安装新依赖或新增菜单 SQL。

页面发送 `prompt` 时附带当前登录令牌 `stockAccessToken`。网关只在本轮异步工具调用中
将它作为 `Authorization: Bearer ...` 透传，不加入模型提示、工具参数、工具结果或会话存储。
Java 接口继续校验 `stock:analyzer:analyze` 权限。不配置静态管理员 Token；旧客户端不提供
此字段仍能聊天，但调用股票工具会提示缺少登录身份。生产环境的浏览器连接应使用 HTTPS/WSS。

`backend/skills/stock-520/SKILL.md` 的正文由网关直接注入股票子代理，组织“趋势 → 买点 → 执行与仓位”
分析流程，调用 `stock_analyze` 取得规则和证据，由股票子代理进行解读。规则数值和判定
仍以 Java 引擎为准，Skill 不复制实现一套计算逻辑。首批不包含自选、持仓查询或修改操作。

`stock-research` 技能指导股票子代理使用 `web_search` 搜索公开资讯、区分事件日期和查询
时间、提供来源链接。联网搜索使用固定的 Tavily HTTPS 搜索接口，不提供任意 URL 抓取
或内部 HTTP 查询。在同一网关环境配置中填写：

```dotenv
TAVILY_API_KEY=填写Tavily密钥
```

修改后重启网关。未配置时搜索会报告缺少服务端配置，不影响 Java 股票工具。不要在聊天
中提供密钥。搜索只发送公开关键词，不发送工作台 Token 或模型认证信息。

两层代理均禁止 `read`、`grep`、`find`、`ls`、`write`、`edit`、`bash`、执行代码等内部
工具，并关闭全局扩展、MCP、项目上下文和提示模板的自动加载。工具权限由后端精确
白名单限制，不能通过修改角色文件或页面设置扩大。股票技能已加载在系统提示中，无需
也不能让代理读取文件。主 Agent 不直接调用股票工具或搜索工具，股票子代理不能递归委派。

更新并重启网关后，在新会话中可以提问：

- “查一下 600519 的最新行情。”
- “看看 sz000001 最近30天的日K线和均线。”
- “用520战法分析 510300，说明趋势、买点和判断依据。”
- “分析西藏珠峰。”（先检索名称，唯一精确匹配后自动继续分析）

名称搜索只在唯一精确匹配时自动确定标的；模糊匹配或同名结果会列出候选，用户确认
后再分析。搜索工具不返回行情，后续的行情和规则分析仍使用明确的市场前缀代码。

也可显式输入 `/skill:stock-520 分析600519`。更新前已加载的会话可在空闲时从设置页触发
资源重载，或新建会话。工具返回来源和查询时间，行情及K线自身的时间应分别解读。

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

Pi Agent Gateway 可以调用文件和终端工具。菜单可见性不是网关鉴权，不能把 3000
端口直接开放到公网。建议让网关只监听 `127.0.0.1`，并在 nginx 层通过内网、VPN、
访问白名单或统一认证限制 `/agent-ws`。菜单 SQL 默认只把页面授权给角色 1 和 4。

