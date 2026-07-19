# 520均线战法 AI 股票分析系统

## 架构说明

将 `stock_520_analyzer.py` 的功能嵌入 RuoYi-Vue 项目，实现 Web 化的股票 AI 分析系统。

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

1. 执行 `sql/stock_menu.sql` 添加菜单权限（或在系统管理-菜单管理手动添加）
2. 确保 DeepSeek API Key 配置正确（不配置则跳过AI分析，仅展示技术指标）

### 菜单

- 目录: 股票管理 (order=5)
- 页面: AI分析报告 → `/stock/analyzer`
- 权限标识: `stock:analyzer:analyze`
