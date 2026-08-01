# 520 均线战法 AI 股票分析系统

基于 RuoYi-Vue 3.9.2 构建的 Web 股票分析系统，结合实时行情、K 线、MA5/MA20 均线、交易信号与 DeepSeek 综合解读，为股票分析、自选管理和持仓管理提供统一的可视化报告。

> 本项目仅用于技术研究与学习，不构成任何投资建议。证券市场存在风险，请独立判断并自行承担交易风险。

## 功能特性

- **AI 股票分析**：输入股票代码后生成行情、K 线、均线趋势、交易信号和策略报告。
- **520 均线策略**：根据 MA5、MA20 及价格关系判断趋势、买点和退出条件。
- **趋势过滤**：第一步趋势不向上时，不展示第二步“找买点”。
- **我的自选**：添加时只需输入股票代码，系统自动识别并保存股票名称。
- **我的持仓**：维护成本价、数量和账户总资产，展示盈亏、止损止盈及仓位管理。
- **统一报告布局**：三个页面共用行情概览与策略报告组件；持仓页额外展示止损止盈和仓位管理。
- **按需 AI 分析**：点击“AI 分析”可主动刷新 DeepSeek 解读；自动刷新时只有完整 K 线发生变化才重新生成 AI 内容。
- **分析缓存**：自选分析按股票代码缓存 5 分钟，缓存有效时直接展开；点击刷新或缓存过期后重新获取。
- **持仓快照**：持仓分析结果保存到数据库，再次展开时可直接读取最近一次分析。

## 页面说明

| 页面 | 主要能力 | 缓存行为 |
| --- | --- | --- |
| AI 分析报告 | 单只股票技术分析与 DeepSeek 解读 | 当前浏览器会话保存最后一次结果 |
| 我的自选 | 关注股票、自动识别名称、展开分析 | 按股票缓存 5 分钟 |
| 我的持仓 | 成本、数量、盈亏、止损止盈、仓位管理 | 数据库保存最近分析快照 |

## 技术栈

### 后端

- Java 17
- Spring Boot 4.0.6
- Spring Security + JWT
- MyBatis
- MySQL
- Redis
- Maven

### 前端

- Vue 2.6
- Element UI 2.15
- ECharts 5
- Vue CLI 4
- Axios

### 外部服务

- 腾讯行情接口：实时股票行情
- 新浪行情接口：历史 K 线数据
- DeepSeek API：AI 综合解读（可选）

## 分析流程

```text
股票代码
  ├─ 获取腾讯实时行情
  ├─ 获取新浪 K 线
  ├─ 计算 MA5 / MA20
  ├─ 判断均线趋势与交易信号
  ├─ 生成 520 策略规则报告
  └─ K 线变化时调用 DeepSeek 生成综合解读
```

主要信号包括金叉、弱金叉、死叉、回踩和均线粘合发散。

## 项目结构

```text
ai-stock/
├─ ruoyi-admin/       # Web 入口、股票 Controller、应用配置
├─ ruoyi-framework/   # 若依框架与安全配置
├─ ruoyi-system/      # 股票分析、策略规则、持仓和自选业务
├─ ruoyi-common/      # 通用模块
├─ ruoyi-ui/          # Vue 前端
└─ sql/               # 基础数据库与股票功能 SQL
```

股票相关核心文件：

```text
ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/
ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/
ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java
ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockStrategyReportBuilder.java
ruoyi-ui/src/views/stock/
ruoyi-ui/src/components/StockAnalysisOverview/
ruoyi-ui/src/components/StockStrategyReport/
```

## 环境要求

- JDK 17+
- Maven 3.9+
- Node.js 16+ 与 npm
- MySQL 8+
- Redis 6+

## 初始化数据库

1. 创建数据库，例如 `ry-vue`。
2. 执行若依基础表结构：

   ```text
   sql/ry_20260417.sql
   sql/quartz.sql
   ```

3. 执行股票功能表和菜单：

   ```text
   sql/stock_menu.sql
   ```

`stock_menu.sql` 会创建自选、持仓、账户和持仓分析快照表，并初始化股票管理菜单与权限。

## 配置

### 数据库与 Redis

修改以下文件中的本地连接信息：

- `ruoyi-admin/src/main/resources/application-druid.yml`
- `ruoyi-admin/src/main/resources/application.yml`

### DeepSeek

在 `ruoyi-admin/src/main/resources/application.yml` 中配置：

```yaml
deepseek:
  api-key: ${DEEPSEEK_API_KEY:}
  base-url: https://api.deepseek.com/v1/chat/completions
```

建议通过环境变量提供密钥：

```powershell
$env:DEEPSEEK_API_KEY="你的 DeepSeek API Key"
```

未配置 API Key 时，系统仍会生成技术指标和规则报告，但不会生成 DeepSeek 综合解读。不要把真实 API Key 提交到 Git。

## 启动项目

### 1. 启动后端

```powershell
mvn clean package -DskipTests
java -jar ruoyi-admin/target/ruoyi-admin.jar
```

后端默认地址：`http://localhost:8080`

### 2. 启动前端

```powershell
cd ruoyi-ui
npm install
npm run dev
```

前端默认地址：`http://localhost`

若使用若依初始化数据，可通过默认账号登录：`admin / admin123`。部署到公开环境前请立即修改默认密码。

## API 概览

| 方法 | 地址 | 说明 |
| --- | --- | --- |
| POST | `/stock/analyzer/analyze` | 分析指定股票 |
| GET | `/stock/watchlist/list` | 查询我的自选 |
| POST | `/stock/watchlist` | 添加自选并自动识别名称 |
| DELETE | `/stock/watchlist/{watchlistId}` | 移除自选 |
| GET | `/stock/position/list` | 查询持仓 |
| POST | `/stock/position` | 新增持仓 |
| PUT | `/stock/position` | 更新持仓 |
| DELETE | `/stock/position/{id}` | 删除持仓 |
| GET | `/stock/position/{id}/analysis` | 读取持仓分析快照 |
| POST | `/stock/position/{id}/analyze` | 重新分析持仓 |

请求需要登录，并受对应的 `stock:*` 权限控制。

## 测试与构建

后端策略测试：

```powershell
mvn -pl ruoyi-system -Dtest=StockStrategyReportBuilderTest test
```

前端股票模块测试：

```powershell
cd ruoyi-ui
npm run test:stock-expand
npm run test:stock-kline
npm run test:stock-list-kline
npm run test:stock-session
npm run test:stock-strategy
npm run test:stock-auto-ai
npm run test:stock-watchlist-cache
```

前端生产构建：

```powershell
npm run build:prod
```

## 数据与缓存说明

- 实时行情和 K 线来自第三方公开接口，可用性、延迟和数据准确性取决于数据提供方。
- 自选分析缓存保存在当前浏览器会话中，有效期为 5 分钟。
- 持仓分析快照保存在数据库中，删除持仓时会同步删除相关快照。
- 自动刷新会先获取最新 K 线；完整 K 线未变化时复用已有 AI 解读，避免重复调用 DeepSeek。

## 开源说明

本项目基于 [RuoYi-Vue](https://gitee.com/y_project/RuoYi-Vue) 开发，遵循仓库中的 [MIT License](LICENSE)。
