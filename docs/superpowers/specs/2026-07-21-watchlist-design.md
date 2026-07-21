# 我的自选设计

## 目标

在“股票管理”目录中增加“我的自选”页面。登录用户可以维护自己的自选股票，并从列表直接进入已有的 AI 股票分析报告。

## 范围

- 按登录用户持久化保存自选股；用户只能读取和操作自己的记录。
- 支持新增、列表查询、删除以及重复添加提示。
- 支持 `600519`、`sh600519`、`sz000001` 格式的 A 股代码输入；服务端统一为 6 位代码。
- 每一行提供“分析”按钮，跳转到 `/stock/analyzer`，携带代码并自动发起现有 `/stock/analyzer/analyze` 请求。
- 本次不包含批量分析、行情缓存、分组/备注、持仓或分析结果入库。

## 数据模型

新增 `stock_watchlist` 表：

| 字段 | 说明 |
| --- | --- |
| `watchlist_id` | 主键 |
| `user_id` | 所属登录用户 ID |
| `stock_code` | 标准化后的 6 位股票代码 |
| `stock_name` | 用户可选填写的名称 |
| `create_by/create_time/update_by/update_time` | RuoYi 审计字段 |

建立 `(user_id, stock_code)` 唯一索引，数据库和服务层均阻止当前用户重复添加同一股票。

## 后端

新增 Domain、Mapper、Service 和 Controller，接口位于 `/stock/watchlist`：

- `GET /stock/watchlist/list`：返回当前用户的自选列表。
- `POST /stock/watchlist`：新增当前用户的自选股。
- `DELETE /stock/watchlist/{watchlistId}`：仅删除当前用户拥有的记录；不属于当前用户时按不存在处理。

Controller 使用当前认证上下文取得用户 ID，客户端不能传递或指定用户 ID。接口配套 `stock:watchlist:list`、`stock:watchlist:add`、`stock:watchlist:remove` 权限。

## 前端与菜单

新增 `stock/watchlist/index` 页面和 API 封装：

- 顶部为股票代码、可选名称和“加入自选”按钮。
- 表格显示股票代码、股票名称、添加时间，并提供“分析”“删除”操作。
- “分析”使用路由查询参数转到分析页；分析页在创建时读取该参数，填入股票代码并自动分析。

在现有“股票管理”菜单下新增“我的自选”菜单及三个按钮权限。SQL 同时包含建表、唯一索引和菜单定义。

## 错误处理与验证

- 缺失、格式错误或不支持的股票代码返回明确提示。
- 重复添加返回明确提示，不创建重复数据。
- 前端显示接口失败信息，删除前弹出确认框。
- 后端测试覆盖代码标准化、用户隔离、重复添加与删除；前端执行生产构建验证。
