# 新增持仓自动获取股票名称设计

## 目标

新增持仓时，用户只填写股票代码、成本价和持仓数量。系统根据股票代码从腾讯实时行情接口查询股票名称，保存后在持仓列表中直接显示。

## 方案

采用服务端查询并持久化名称：

1. 新增弹窗删除“股票名称”输入项，新增请求不再提交 `stockName`。
2. `IStockAnalyzerService` 增加轻量名称解析方法，仅复用腾讯实时行情查询，不获取 K 线、不计算均线、不调用 AI。
3. `StockPositionController` 在调用持仓新增服务前解析股票名称，并设置到 `StockPosition.stockName`。
4. `StockPositionServiceImpl` 继续负责代码标准化、市场判断、重复校验和持久化。

该方案确保名称来自服务端可信行情源，并持久化到数据库；列表刷新、重新登录和后续分析均能获得相同名称。

## 错误处理

- 股票代码为空或格式非法时，沿用现有持仓服务校验。
- 腾讯接口无有效数据、返回名称为空或网络调用失败时，名称解析方法抛出明确的业务异常。
- 名称查询失败时不执行数据库插入，前端保留弹窗内容并展示后端错误信息。
- 客户端即使额外提交 `stockName`，服务端仍以行情接口查询结果覆盖，避免伪造名称。

## 文件范围

- 修改 `ruoyi-ui/src/views/stock/position/index.vue`
- 修改 `ruoyi-system/src/main/java/com/ruoyi/system/service/IStockAnalyzerService.java`
- 修改 `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java`
- 修改 `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java`
- 修改或新增相关后端单元测试

不修改数据库结构、Mapper、API 地址、权限标识和持仓编辑流程。

## 测试与验收

- 单元测试证明名称解析只使用实时行情数据，并在无有效行情时失败。
- Controller 或服务级测试证明客户端名称会被查询结果覆盖后再保存。
- 前端生产构建成功，新增弹窗中不存在股票名称输入框。
- 后端目标模块测试成功。
- 新增有效股票代码后，列表返回并显示自动获取的股票名称。
