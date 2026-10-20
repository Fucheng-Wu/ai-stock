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
当前 `ai-stock` 仓库根目录，因此 Agent 的文件和终端工具直接操作本项目。需要改为
其他目录时，可在启动前显式设置该环境变量。

工作台的 `vue.config.js` 已包含 WebSocket 开发代理，无需在浏览器中跨域连接 3000
端口。

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

## 安全提示

Pi Agent Gateway 可以调用文件和终端工具。菜单可见性不是网关鉴权，不能把 3000
端口直接开放到公网。建议让网关只监听 `127.0.0.1`，并在 nginx 层通过内网、VPN、
访问白名单或统一认证限制 `/agent-ws`。菜单 SQL 默认只把页面授权给角色 1 和 4。

