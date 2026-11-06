export const MAX_CACHED_SESSIONS = 8
export const MAX_VISIBLE_MESSAGES = 120

export function groupSessions(sessions, now = Date.now()) {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const week = new Date(today)
  week.setDate(week.getDate() - 6)
  const groups = [{ label: '今天', sessions: [] }, { label: '近七天', sessions: [] }, { label: '更早', sessions: [] }]
  sessions.forEach(session => {
    const time = new Date(session.updatedAt).getTime()
    groups[time >= today.getTime() ? 0 : time >= week.getTime() ? 1 : 2].sessions.push(session)
  })
  return groups.filter(group => group.sessions.length)
}

export function draftKey(userId, sessionId) {
  return `agent-chat:draft:v1:${encodeURIComponent(userId)}:${encodeURIComponent(sessionId || 'new')}`
}

export function toolDescription(tool) {
  const input = tool.input || {}
  const target = input.stockCode || input.keyword || input.query || input.title || (tool.name === 'Agent' ? input.task : tool.name === 'todo_add' ? input.content : '') || ''
  const labels = {
    Agent: tool.subagent && tool.subagent.name ? tool.subagent.name : '调用子代理', stock_search: '检索股票', stock_quote: '查询行情',
    stock_kline: '读取日K线与均线', stock_analyze: '分析520信号', web_search: '搜索公开资讯',
    stock_watchlist_add: '添加自选股票', stock_position_add: '添加持仓记录', todo_add: '添加待办',
    stock_watchlist_list: '查看我的自选', stock_position_list: '查看我的持仓', todo_list: '查看待办清单',
    report_clock: '查看北京时间', report_task_list: '查询报告任务', report_task_get: '查看任务详情',
    report_task_create: '创建报告任务', report_task_update: '修改报告任务', report_task_status: '暂停或恢复任务',
    report_task_delete: '删除报告任务', report_task_run: '立即生成报告', report_list: '查询报告', report_get: '阅读报告', report_delete: '删除报告'
  }
  return `${labels[tool.name] || tool.name}${target ? ` · ${String(target).slice(0, 60)}` : ''}`
}

export function toolPreview(tool) {
  if (tool.status === 'running') {
    if (tool.name === 'Agent') return '子代理正在处理任务'
    if (tool.name === 'stock_watchlist_add' || tool.name === 'stock_position_add') return '正在保存股票记录'
    if (tool.name === 'todo_add') return '正在保存待办'
    return '正在获取数据，请稍候'
  }
  if (!tool.output) return tool.status === 'error' ? '执行失败，展开查看详情' : '执行完成'
  try {
    const result = JSON.parse(tool.output)
    if (Array.isArray(result.rows) && typeof result.total === 'number') return `查询到 ${result.total} 条记录${result.page ? ` · 第 ${result.page} 页` : ''}`
    if (result.taskId && result.title) return result.executionReady === false ? `${result.title} · 已保存，待执行器就绪` : `${result.title}${result.nextRunAt ? ` · 下次 ${new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short' }).format(result.nextRunAt)}` : ''}`
    if (result.operation === 'list') return `查询到 ${result.total} 条记录 · 第 ${result.page} 页${result.hasMore ? ' · 还有更多' : ''}`
    if (result.success && result.target === 'todo') return `已添加待办 · ${result.category} · ${result.content}`
    if (result.success && result.target === 'watchlist') return `已加入我的自选 · ${result.stockCode}`
    if (result.success && result.target === 'position') return `已加入我的持仓 · ${result.stockCode} · 成本 ${result.costPrice} 元 · ${result.quantity} 股`
    if (result.source) return `${result.source}${result.fetchedAt ? ` · 查询时间 ${new Date(result.fetchedAt).toLocaleString('zh-CN')}` : ''}`
  } catch (_) { /* Plain-text results are also supported. */ }
  return tool.output.replace(/\s+/g, ' ').slice(0, 100)
}
