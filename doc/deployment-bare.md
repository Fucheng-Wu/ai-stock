# 裸部署（压缩包上传）指南

不使用 Docker/CI，直接把文件传到服务器手动部署。两种打包方式，按需选：

| 方案 | 压缩包里装什么 | 服务器需要装 | 适合 |
|---|---|---|---|
| **A：本地打包好再上传**（推荐） | `jar` + `dist` + 配置/SQL/Nginx/启动脚本 | JDK17 + MySQL + Redis + Nginx | 服务器最轻、上线最快 |
| **B：上传源码在服务器编译** | 项目源码（去掉 node_modules/target/dist/.git） | 上面这些 **+ Maven + Node** | 服务器上想随时改源码重编 |

> 服务器端的**数据库初始化、配置外部化、Nginx（含 SSE 关缓冲）、systemd 守护**等通用步骤详见 [deployment.md](deployment.md)，本文只讲"打包 → 上传 → 解压 → 跑起来"的差异部分，并在结尾给出完整串联。

---

## 方案 A：本地打包好，上传部署包

### A1. 本地编译（在你这台 Windows 机器上）

```powershell
# 项目根目录：打后端 jar
mvn clean package -Dmaven.test.skip=true
# 产物：ruoyi-admin\target\ruoyi-admin.jar（名字可能带版本号，以实际为准）

# 打前端
cd ruoyi-ui
npm install            # 首次
npm run build:prod     # 产物：ruoyi-ui\dist\
cd ..
```

### A2. 组装"部署包"目录

新建一个目录（例如 `ai-chat-deploy`），按下面结构放进去：

```
ai-chat-deploy/
├── ruoyi-admin.jar                 # 来自 ruoyi-admin/target/ (重命名去掉版本号方便)
├── dist/                           # 来自 ruoyi-ui/dist/
├── config/
│   ├── application.yml             # 真实 redis/dify/上传路径/密钥（覆盖 jar 内置）
│   └── application-druid.yml       # 真实数据库连接
├── sql/
│   ├── ry_20260417.sql
│   ├── quartz.sql
│   └── ai_chat.sql
├── nginx/ai-chat.conf              # Nginx 站点配置
├── ai-chat.service                 # systemd 服务单元
└── start.sh                        # 备用：非 systemd 的快速启动脚本
```

PowerShell 一键组装示例：
```powershell
$d = "ai-chat-deploy"
Remove-Item $d -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path "$d","$d/config","$d/sql","$d/nginx" | Out-Null
Copy-Item (Get-ChildItem ruoyi-admin/target/ruoyi-admin*.jar | Select-Object -First 1).FullName "$d/ruoyi-admin.jar"
Copy-Item ruoyi-ui/dist "$d/dist" -Recurse
Copy-Item sql/ry_20260417.sql,sql/quartz.sql,sql/ai_chat.sql "$d/sql/"
# config/nginx/service/start.sh 用下面的模板内容手动创建到对应位置
```

**`config/application-druid.yml`**（真实数据库）：
```yaml
spring:
  datasource:
    druid:
      master:
        url: jdbc:mysql://127.0.0.1:3306/ry-vue?useUnicode=true&characterEncoding=utf8&zeroDateTimeBehavior=convertToNull&useSSL=false&serverTimezone=GMT%2B8
        username: ruoyi
        password: 你的数据库密码
```

**`config/application.yml`**（真实 redis/dify/上传路径/密钥）：
```yaml
ruoyi:
  profile: /home/ruoyi/uploadPath          # Linux 上传目录
spring:
  data:
    redis:
      host: 127.0.0.1
      port: 6379
      password: 你的Redis密码                # 无则留空
token:
  secret: 改成随机长字符串
dify:
  base-url: http://你的dify主机/v1           # 必须以 /v1 结尾
  api-key: app-你的真实APIKey
  input-variable: query
  timeout: 60000
```

**`nginx/ai-chat.conf`**（关键：SSE 关缓冲，详见 deployment.md 第 6 节）：
```nginx
server {
    listen 80;
    server_name 你的域名或IP;

    location / {
        root /usr/share/nginx/ai-chat/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }
    location /prod-api/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 30m;
        # AI 问答 SSE 流式必需
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        chunked_transfer_encoding on;
    }
}
```

**`ai-chat.service`**（systemd）：
```ini
[Unit]
Description=AI Chat Backend (RuoYi)
After=network.target mysql.service redis.service
[Service]
Type=simple
User=ruoyi
WorkingDirectory=/opt/ai-chat
ExecStart=/usr/bin/java -jar /opt/ai-chat/ruoyi-admin.jar
SuccessExitStatus=143
Restart=on-failure
RestartSec=10
[Install]
WantedBy=multi-user.target
```

**`start.sh`**（不想用 systemd 时的快速启动，后台运行）：
```bash
#!/bin/bash
cd "$(dirname "$0")"
nohup java -jar ruoyi-admin.jar > app.log 2>&1 &
echo "started, pid=$!  日志: tail -f app.log"
```

### A3. 压缩

```powershell
Compress-Archive -Path ai-chat-deploy\* -DestinationPath ai-chat-deploy.zip -Force
```

### A4. 上传到服务器

任选其一：
- **宝塔/面板**：文件管理里上传 `ai-chat-deploy.zip` 并在线解压。
- **scp**：`scp ai-chat-deploy.zip root@服务器IP:/opt/`
- **WinSCP / FileZilla**：拖拽上传。

### A5. 服务器上部署（解压即用，无需编译）

```bash
# 1) 装运行环境（CentOS 用 yum，Ubuntu 用 apt；MySQL/Redis 也可用面板一键装）
yum install -y java-17-openjdk nginx        # JDK17 + Nginx
# 另外装好 MySQL 5.7+/8、Redis 5+（略）

# 2) 解压部署包
mkdir -p /opt/ai-chat && cd /opt/ai-chat
unzip /opt/ai-chat-deploy.zip -d /opt/ai-chat     # 得到 ruoyi-admin.jar / dist / config / sql / nginx / service

# 3) 放好前端 + 创建上传目录 + 准备用户
mkdir -p /usr/share/nginx/ai-chat && cp -r dist /usr/share/nginx/ai-chat/
useradd -r -s /sbin/nologin ruoyi 2>/dev/null; mkdir -p /home/ruoyi/uploadPath && chown -R ruoyi:ruoyi /home/ruoyi/uploadPath /opt/ai-chat

# 4) 初始化数据库（详见 deployment.md 第 2 节）
mysql -uroot -p -e "CREATE DATABASE \`ry-vue\` DEFAULT CHARACTER SET utf8mb4;"
mysql -uroot -p ry-vue < sql/ry_20260417.sql
mysql -uroot -p ry-vue < sql/quartz.sql
mysql -uroot -p ry-vue < sql/ai_chat.sql

# 5) 改好 config/ 里的数据库/Redis/Dify（A2 模板里的真实值）

# 6) 起后端
cp ai-chat.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now ai-chat
systemctl status ai-chat ; journalctl -u ai-chat -f      # 看是否 Started

# 7) 配 Nginx
cp nginx/ai-chat.conf /etc/nginx/conf.d/ && nginx -t && systemctl reload nginx
```

完成。浏览器访问 `http://你的域名/`，验证登录 + AI 问答**逐字流式**（详见 deployment.md 第 8 节）。

---

## 方案 B：上传源码，在服务器编译

### B1. 本地压缩源码（排除可重新生成的大目录）

PowerShell（排除 node_modules / target / dist / .git / .superpowers）：
```powershell
$src = "C:\wufc\ehs\RuoYi-Vue"
$out = "C:\wufc\ehs\ai-chat-src.zip"
$exclude = @('node_modules','target','dist','.git','.superpowers','.idea')
$items = Get-ChildItem -Path $src -Force | Where-Object { $exclude -notcontains $_.Name }
Compress-Archive -Path $items.FullName -DestinationPath $out -Force
```
> 排除这些目录能把压缩包从几百 MB 降到几 MB（它们在服务器上会重新生成）。也可用本仓库的 `package-project-zip` 技能自动排除。

### B2. 上传并解压（服务器）

```bash
mkdir -p /opt/ai-chat-src && cd /opt/ai-chat-src
unzip /opt/ai-chat-src.zip -d /opt/ai-chat-src
```

### B3. 装编译环境并编译（服务器）

```bash
# 装 JDK17 + Maven + Node（面板或包管理器均可）
yum install -y java-17-openjdk maven
curl -fsSL https://rpm.nodesource.com/setup_16.x | bash - && yum install -y nodejs   # 或 nvm

# 编译后端
cd /opt/ai-chat-src
mvn clean package -Dmaven.test.skip=true        # 得到 ruoyi-admin/target/ruoyi-admin*.jar

# 编译前端
cd ruoyi-ui && npm install && npm run build:prod  # 得到 ruoyi-ui/dist
cd /opt/ai-chat-src
```

> 在服务器上编译前，**先把数据库/Redis/Dify 配置改到源码里**（`ruoyi-admin/src/main/resources/application-druid.yml`、`application.yml` 的 `dify`/`redis`），或编译后用方案 A 的 `config/` 外部化方式覆盖。

### B4. 之后步骤同方案 A 的 A5

把编译出的 `ruoyi-admin*.jar` 放到 `/opt/ai-chat/`、`ruoyi-ui/dist` 放到 Nginx 目录，初始化数据库、配 systemd、配 Nginx（同上）。

---

## 两种方案怎么选

- **追求服务器干净、上线快** → 方案 A（强烈推荐）：服务器永远不用装 Maven/Node，改代码就在本地重编、重传 jar/dist。
- **运维习惯在服务器上 git pull + 现场编译** → 方案 B。

---

## 通用注意（两种方案都适用）

- **JDK 必须 17**（Spring Boot 4.x）。
- 启动顺序：MySQL → Redis → 后端 → Nginx。
- **Nginx 必须 `proxy_buffering off`**，否则 AI 问答流式（打字机）失效。
- **Dify 连通性**：服务器要能访问 `dify.base-url`；用户浏览器要能访问 Dify 站点（文件卡片"打开"用）。
- 普通用户需被分配「AI问答」菜单(`ai:chat:use`)才有 `/aichat`。
- 上线前改默认密码与 `token.secret`（详见 deployment.md 第 11 节）。

---

> 需要我**直接帮你生成部署压缩包**吗？我可以现在跑一遍本地编译，把方案 A 的部署包（jar + dist + config 模板 + sql + nginx + service + start.sh）组装好并压成 `ai-chat-deploy.zip`，或用 `package-project-zip` 技能生成方案 B 的源码包。
