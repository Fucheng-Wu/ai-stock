# 工作台子代理

当前工作台开放五个独立子代理：

- `stock-analyst/agent.md`：股票分析，`tools.ts` 提供四个股票业务工具和本轮身份透传；
- `web-researcher/agent.md`：信息检索，`web-search.ts` 提供各领域的公开联网搜索。
- `stock-screener/agent.md`：全市场选股，`tools.ts` 只读查询已完成的520筛选快照和逐只规则证据。
- `stock-portfolio/agent.md`：股票记录，`tools.ts` 查询当前用户自选/持仓，或将用户明确指定的股票添加到对应清单。
- `todo-recorder/agent.md`：待办记录，`tools.ts` 查询当前用户待办，或将用户明确指定的事项添加到个人待办清单。

网关按角色显式注册对应工具。主 Agent 固定为普通 Agent（`general`），通过 `Agent` 工具委派给这五个角色。
不再加载上游的通用执行、代码探索、方案规划或全局自定义子代理。

工具按角色隔离：

- 股票分析：`stock_search`、`stock_quote`、`stock_kline`、`stock_analyze`，复用股票业务接口；
- 信息检索：仅 `web_search`，Tavily 公开联网搜索，需要服务端 `TAVILY_API_KEY`。
- 全市场选股：仅 `stock_screen`、`stock_screen_detail`，支持沪深北筛选快照；每次调用用当前身份重新校验 `agent:chat:use` 和 `stock:analyzer:analyze`。
- 股票记录：仅 `stock_search`、`stock_watchlist_add`、`stock_position_add`、`stock_watchlist_list`、`stock_position_list`。名称搜索沿用 `stock:analyzer:analyze`；新增前重新校验 `agent:chat:use` 和 `stock:watchlist:add` / `stock:position:add`，并透传本轮身份给 Java 接口，不要求列表权限、不接收用户ID。自选仅需股票；持仓必须提供每股成本价（最多两位小数）和正整数股数。查询校验对应 `stock:watchlist:list` / `stock:position:list`，无需新增或分析权限，支持名称/代码筛选与分页。角色只查询和新增工作台记录，不覆盖持仓、不删除、不下单。
- 待办记录：仅 `todo_add`、`todo_list`，固定 `POST /todo/task` 和 `GET /todo/task/list`，新增前校验 `agent:chat:use` 和 `todo:task:add`，无需股票或列表权限。内容1～500字符，分类仅工作/学习/生活，未指定可按内容归类、无法判断时默认工作；查询校验 `agent:chat:use` 和 `todo:task:list`，按内容、分类、完成状态筛选并分页；支持查询和新增未完成事项，不修改、删除、设置日期或提醒。分类变更时同步该角色工具的 `CATEGORIES`、角色提示与待办页面常量。

信息检索不限于股票领域。混合任务由主 Agent 先检索，再将问题和带来源、日期的结果交给股票子代理。
股票或选股子代理需要补充证据时向主 Agent 提出检索需求，五个子代理不能相互或递归委派。

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

例如：“把贵州茅台加入自选”；“记录平安银行持仓，成本12.30元，250股”。名称模糊时先确认候选，持仓信息缺失时先询问。
新增请求超时、网络中断或响应损坏时结果可能未知，必须先提示用户在股票管理菜单核实，不自动重试；已有记录按业务错误报告。
更新需部署新角色目录并重启网关；聊天页工具名称随前端更新。复用现有股票表和新增权限，不需要数据库迁移。

待办示例：“帮我添加待办：买牛奶，生活类”“把阅读Java并发文章记入学习待办”。结果未知时先到个人待办清单核实，不自动重试；接口允许相同内容，子代理不声称查重。切回清单时自动刷新列表。
业务工具共用 `src/lib/workbench-api.ts` 的本轮身份与若依请求封装，沿用 `STOCK_API_BASE_URL` 指向同一个 Java 后端，不需要新增环境变量。待办角色同样复用现有表和新增权限。
