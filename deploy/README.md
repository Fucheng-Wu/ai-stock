# orange 工作台生产部署

本目录的模板基于旧版 `ai-stock-deploy-v0.0.7`，部署路径统一为
`/home/wufc/ai-stock`。新版本增加了 Pi Agent Gateway、MySQL 会话持久化、独立
systemd 服务以及 `/agent-ws` WebSocket 反向代理。

## 一、本地打包

在 Windows 项目根目录执行：

```powershell
.\bin\package-deploy.ps1 -Version 0.0.8
```

脚本会执行 Maven 后端打包和 Vue 生产构建，并在项目同级目录生成：

```text
ai-stock-deploy-v0.0.8/
ai-stock-deploy-v0.0.8.zip
```

部署包包含 Java JAR、Vue `dist`、Agent Gateway 源码与 pnpm 锁文件、生产配置模板、
SQL、Nginx 配置和两个 systemd 服务。Agent Gateway 在服务器安装依赖，因此不要从
Windows 复制 `node_modules`。

## 二、服务器环境

服务器需要：

- JDK 17；
- Node.js 22.19+；
- 通过 Corepack 启用的 pnpm 10；
- MySQL 8、Redis、Nginx、unzip；
- Linux 用户 `wufc`。

确认命令：

```bash
java -version
node -v
pnpm -v
mysql --version
nginx -v
```

服务器不需要 Maven，也不需要运行 Vue 开发服务器。

## 三、上传并解压

从本机上传：

```powershell
scp ..\ai-stock-deploy-v0.0.8.zip wufc@服务器地址:/home/wufc/
```

首次部署：

```bash
sudo mkdir -p /home/wufc/ai-stock
sudo unzip /home/wufc/ai-stock-deploy-v0.0.8.zip -d /home/wufc/ai-stock
sudo mkdir -p /home/wufc/ai-stock/uploadPath /home/wufc/ai-stock/workspace /home/wufc/.pi/agent
sudo chown -R wufc:wufc /home/wufc/ai-stock /home/wufc/.pi
```

升级前先备份生产配置和旧程序，不要覆盖 `config/*.env`、`~/.pi/agent` 和数据库：

```bash
sudo systemctl stop ai-stock-agent ai-stock
cp -a /home/wufc/ai-stock /home/wufc/ai-stock-backup-$(date +%Y%m%d-%H%M%S)
unzip -o /home/wufc/ai-stock-deploy-v0.0.8.zip -d /home/wufc/ai-stock
sudo chown -R wufc:wufc /home/wufc/ai-stock
```

## 四、配置生产参数

首次部署复制环境变量模板：

```bash
cd /home/wufc/ai-stock
cp config/ai-stock.env.example config/ai-stock.env
cp config/agent-gateway.env.example config/agent-gateway.env
chmod 600 config/ai-stock.env config/agent-gateway.env
```

编辑两个 `.env` 文件，至少替换数据库密码、`TOKEN_SECRET`。Java 与 Agent Gateway
默认连接同一个 `ai_stock` 数据库。`application.yml` 和 `application-druid.yml`
已经通过环境变量引用这些配置，无需把密码写入 YAML。

Agent 模型认证和配置保存在 `/home/wufc/.pi/agent`。首次进入 Agent 页面后可以通过
页面配置 Provider；也可以在停服状态下安全迁移已有的 `auth.json`、`models.json`
等文件，并确保只有 `wufc` 用户可读写：

```bash
chmod -R go-rwx /home/wufc/.pi/agent
```

## 五、数据库

数据库和表已经存在时，只需执行本次新增或更新 SQL：

```bash
mysql -u root -p ai_stock < /home/wufc/ai-stock/sql/agent_chat.sql
mysql -u root -p ai_stock < /home/wufc/ai-stock/sql/agent_chat_menu.sql
```

首次初始化则依次执行 `ry_20260417.sql`、`quartz.sql`、`stock_menu.sql`、
`stock_watchlist_analysis_snapshot.sql`、`stock_deepseek_config.sql`、`todo_menu.sql`、
`agent_chat.sql` 和 `agent_chat_menu.sql`。

建议 Agent Gateway 使用最小权限账号：

```sql
CREATE USER 'agent_gateway'@'127.0.0.1' IDENTIFIED BY '替换成强密码';
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_stock.agent_chat_session
TO 'agent_gateway'@'127.0.0.1';
FLUSH PRIVILEGES;
```

## 六、安装 Agent Gateway 依赖

```bash
cd /home/wufc/ai-stock/agent-gateway
sudo -u wufc pnpm install --frozen-lockfile
```

这里必须安装完整依赖，因为当前 Gateway 使用 `tsx` 直接运行 TypeScript。以后只在
`pnpm-lock.yaml` 变化时重新执行。

## 七、安装 systemd 服务

```bash
sudo cp /home/wufc/ai-stock/systemd/ai-stock.service /etc/systemd/system/
sudo cp /home/wufc/ai-stock/systemd/ai-stock-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ai-stock ai-stock-agent
sudo systemctl restart ai-stock
sudo systemctl restart ai-stock-agent
```

查看状态与日志：

```bash
sudo systemctl status ai-stock ai-stock-agent --no-pager
sudo journalctl -u ai-stock -n 200 --no-pager
sudo journalctl -u ai-stock-agent -n 200 --no-pager
```

## 八、配置 Nginx

模板已经把旧配置中的前端路径统一为 `/home/wufc/ai-stock/dist`，并新增
`/agent-ws` 到 `127.0.0.1:3000/ws` 的 WebSocket 代理：

```bash
sudo cp /home/wufc/ai-stock/nginx/ai-stock.conf /etc/nginx/conf.d/ai-stock.conf
sudo nginx -t
sudo systemctl reload nginx
```

如果 Certbot 或面板另有 HTTPS `server` 配置，必须把 `/prod-api/` 和 `/agent-ws`
两个 location 同步放入 HTTPS server，否则页面通过 HTTPS 访问时 WebSocket 无法工作。

## 九、检查部署结果

```bash
curl -f http://127.0.0.1:8080/
curl -f http://127.0.0.1:3000/api/health
ss -lntp | grep -E ':80|:3000|:8080'
```

浏览器访问 `https://orangespark.site`，检查登录、股票、待办和 Agent 多会话。

## 安全注意

Agent Gateway 能调用文件和终端工具，必须保持 `HOST=127.0.0.1`，不得直接向公网开放
3000 端口。当前菜单权限并不等于 WebSocket 鉴权；公网部署时还应在 Nginx、VPN、
Cloudflare Access 或其他统一认证层限制 `/agent-ws`。`PI_WORKSPACE_DIR` 默认使用独立
的 `/home/wufc/ai-stock/workspace`，避免 Agent 直接修改生产程序文件。
