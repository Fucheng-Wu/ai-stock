# 股票子代理

当前工作台只开放 `stock-analyst`，配置位于 `stock-analyst/agent.md`。
该目录同时维护 `tools.ts`（四个股票业务工具和本轮身份透传）与
`web-search.ts`（联网搜索工具）。网关创建股票子代理时显式导入并注册这些实现。
主 Agent 固定为普通 Agent（`general`），只能通过 `Agent` 工具委派给该角色。
不再加载上游的通用执行、代码探索、方案规划或全局自定义子代理。

股票子代理只回答股票、ETF、证券知识和财经资讯问题，工具固定为：

- `stock_search`、`stock_quote`、`stock_kline`、`stock_analyze`：股票业务接口；
- `web_search`：Tavily 公开联网搜索，需要服务端 `TAVILY_API_KEY`。

`agent.md` 的正文用于职责与回答约定，frontmatter 展示名称、描述和能力配置。
实际工具、技能和扩展范围由 `src/lib/agent-policy.ts` 固定，角色文件不能扩大范围。
不会加载角色自定义扩展、全局扩展、MCP 或其他代理，也不支持新建其他角色。
模板目录只保留作上游参考，不参与运行时加载。

`stock-520` 与 `stock-research` 的正文由网关读取指定的项目技能文件后直接注入。
不向模型提供 `read`、`grep`、`find`、`ls`、`write`、`edit`、`bash` 或执行代码等内部工具。
主代理不直接获得股票工具、联网工具或股票技能。

`settings.json` 控制子代理总开关、并发上限和禁用角色。停用后不会回退到不受限制的代理。
子代理不继承聊天历史，主代理需在任务中提供必要上下文；不能递归委派。
停止主代理回复时会一起取消子代理及在途业务或搜索请求。
