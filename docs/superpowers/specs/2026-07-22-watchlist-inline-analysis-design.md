# 自选股行内分析设计

## 目标

将“我的自选”的分析操作改为行内展开面板：首次只请求客观技术指标，不调用 DeepSeek；用户点击面板中的“AI分析”后，才请求并显示 DeepSeek 报告。

## 接口

扩展现有 `POST /stock/analyzer/analyze` 请求体，新增可选 `includeAi` 布尔字段。

- `includeAi: false`：返回完整非 AI 结果，不发起 DeepSeek HTTP 请求；AI 字段为空或标记为未请求。
- `includeAi: true` 或省略：保持既有独立分析页行为，返回包含 DeepSeek 报告的结果。

## 前端

- 自选页“分析”按钮请求 `includeAi: false`，将结果展示在该表格行下方的展开面板。
- 面板包含独立分析页全部非 AI 区域：实时行情、MA5/MA20、20 日趋势、交易信号、风险等级、操作纪律。
- “AI分析”按钮仅在技术分析成功后可用；点击时用同一代码请求 `includeAi: true`，并在面板内追加 AI 建议和分析理由。
- 不再从自选页跳转到 `/stock/analyzer`。独立分析页保持原有完整分析体验。

## 验证

- 后端单元测试验证 `includeAi: false` 路径不调用 AI 客户端，`includeAi: true` 保持 AI 结果。
- 前端生产构建通过。
