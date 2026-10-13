# orange的工作台

基于 RuoYi-Vue 的个人工作台，统一入口集成多个功能菜单；520均线战法（股票分析）只是其中一个菜单。

## 菜单总览

| 菜单 | 类型与位置 | 状态 |
|---|---|---|
| 股票管理（520战法） | 内置页面，菜单 2000，order=5 | 已实现 |
| JupyterLab控制台 | 外链 iframe，菜单 2013，order=6 | 已部署 |
| 个人待办清单 | 内置页面，菜单 2014，order=7 | 已实现 |

历史菜单 Hermes控制台（2011）、Pi控制台（2012）已隐藏（visible='1'），终端能力统一由 JupyterLab 提供。

## 修改与验证约束

- 只负责修改代码，不做任何验证：不运行编译、构建、测试、lint、启动服务等命令。
- 修改完成后不要尝试验证结果，用户会在本地拉取代码后自行打包构建验证。
- 除非用户明确要求，否则不要运行 `mvn`、`npm`、`yarn`、测试脚本等验证性命令。

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
