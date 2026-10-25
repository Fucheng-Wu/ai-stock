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
  const target = input.stockCode || input.keyword || input.query || (tool.name === 'Agent' ? input.task : '') || ''
  const labels = {
    Agent: '股票子代理分析', stock_search: '检索股票', stock_quote: '查询行情',
    stock_kline: '读取日K线与均线', stock_analyze: '分析520信号', web_search: '搜索公开资讯'
  }
  return `${labels[tool.name] || tool.name}${target ? ` · ${String(target).slice(0, 60)}` : ''}`
}

export function toolPreview(tool) {
  if (tool.status === 'running') return tool.name === 'Agent' ? '正在委派股票任务并整理分析结果' : '正在获取数据，请稍候'
  if (!tool.output) return tool.status === 'error' ? '执行失败，展开查看详情' : '执行完成'
  try {
    const result = JSON.parse(tool.output)
    if (result.source) return `${result.source}${result.fetchedAt ? ` · 查询时间 ${new Date(result.fetchedAt).toLocaleString('zh-CN')}` : ''}`
  } catch (_) { /* Plain-text results are also supported. */ }
  return tool.output.replace(/\s+/g, ' ').slice(0, 100)
}
