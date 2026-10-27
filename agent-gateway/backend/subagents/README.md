# 工作台子代理

当前工作台开放三个独立子代理：

- `stock-analyst/agent.md`：股票分析，`tools.ts` 提供四个股票业务工具和本轮身份透传；
- `web-researcher/agent.md`：信息检索，`web-search.ts` 提供各领域的公开联网搜索。
- `stock-screener/agent.md`：全市场选股，`tools.ts` 只读查询已完成的520筛选快照和逐只规则证据。

网关按角色显式注册对应工具。主 Agent 固定为普通 Agent（`general`），通过 `Agent` 工具委派给这三个角色。
不再加载上游的通用执行、代码探索、方案规划或全局自定义子代理。

工具按角色隔离：

- 股票分析：`stock_search`、`stock_quote`、`stock_kline`、`stock_analyze`，复用股票业务接口；
- 信息检索：仅 `web_search`，Tavily 公开联网搜索，需要服务端 `TAVILY_API_KEY`。
- 全市场选股：仅 `stock_screen`、`stock_screen_detail`，支持沪深北筛选快照；每次调用用当前身份重新校验 `agent:chat:use` 和 `stock:analyzer:analyze`。

信息检索不限于股票领域。混合任务由主 Agent 先检索，再将问题和带来源、日期的结果交给股票子代理。
股票或选股子代理需要补充证据时向主 Agent 提出检索需求，三个子代理不能相互或递归委派。

`agent.md` 的正文用于职责与回答约定，frontmatter 展示名称、描述和能力配置。
实际工具、技能和扩展范围由 `src/lib/agent-policy.ts` 固定，角色文件不能扩大范围。
不会加载角色自定义扩展、全局扩展、MCP 或其他代理，也不支持新建其他角色。
模板目录只保留作上游参考，不参与运行时加载。

`stock-520` 仅注入股票子代理，`web-research` 仅注入信息检索子代理；网关直接读取指定的项目技能文件。
不向模型提供 `read`、`grep`、`find`、`ls`、`write`、`edit`、`bash` 或执行代码等内部工具。
主代理不直接获得股票工具、联网工具或股票技能。

选股角色不加载股票分析或检索技能，不拥有实时行情、网络或文件工具。后端通过鉴权Java API只读MySQL业务快照，
模型只能指定筛选条件、代码、行情日期和已返回的 snapshotId，不能提供文件路径。
列表默认最新已完成快照；分页和详情应沿用 snapshotId。日期不存在时报错，不回退冒充该日数据。
数据生成、更新和部署见 `docs/stock-history-download.md`。

`settings.json` 控制子代理总开关、并发上限和禁用角色。停用后不会回退到不受限制的代理。
子代理不继承聊天历史，主代理需在任务中提供必要上下文；不能递归委派。
停止主代理回复时会一起取消子代理及在途业务或搜索请求。
