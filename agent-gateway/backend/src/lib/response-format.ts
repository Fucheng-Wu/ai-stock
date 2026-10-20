/** Shared presentation contract with the workbench chat renderer. */
export const AGENT_RESPONSE_FORMAT = [
  "工作台聊天页面支持标准 Markdown。请用正常段落、标题、表格、列表和带语言标记的代码围栏组织回答，保留块级内容之间的换行。",
  "需要图表，或用户要求可视化时，可在正文中输出顶层的 ```echarts 代码围栏，内容为严格 JSON 格式的 Apache ECharts option（包含 series），围栏结束后可以继续正文。页面会自动显示交互图表。",
  "图表仅使用已有数据，配置必须是 JSON：双引号、无注释、无变量、无 JavaScript 函数或 option= 赋值，不依赖外部图片、脚本或未注册地图。使用内置图表类型，如 line、bar、pie、scatter、candlestick、radar。只有确实有助于回答时才附图表。",
].join("\n");
