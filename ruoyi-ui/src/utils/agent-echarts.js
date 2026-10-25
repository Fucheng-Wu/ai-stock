const chartTypes = new Set([
  'line', 'bar', 'pie', 'scatter', 'effectScatter', 'candlestick', 'radar', 'heatmap',
  'tree', 'treemap', 'sunburst', 'graph', 'funnel', 'gauge', 'sankey', 'boxplot',
  'parallel', 'themeRiver', 'pictorialBar'
])

function cleanOption(value, depth = 0) {
  if (depth > 64) throw new Error('图表配置层级过深')
  if (Array.isArray(value)) return value.map(item => cleanOption(item, depth + 1))
  if (!value || typeof value !== 'object') return value
  const result = {}
  Object.keys(value).forEach(key => {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('图表配置包含无效字段')
    // Model-generated charts are data-only: no navigation, external images or HTML data views.
    if (['link', 'sublink', 'image', 'graphic', 'toolbox'].includes(key)) return
    if (key === 'symbol' && typeof value[key] === 'string' && /^image:\/\//i.test(value[key])) {
      result[key] = 'circle'
      return
    }
    const cleaned = cleanOption(value[key], depth + 1)
    result[key] = key === 'tooltip' && cleaned && typeof cleaned === 'object' && !Array.isArray(cleaned)
      ? { ...cleaned, renderMode: 'richText' }
      : cleaned
  })
  return result
}

/** Parse strict JSON only. Never evaluate functions or JavaScript from model output. */
export function parseAgentChart(source, theme = 'light') {
  if (source.length > 1_000_000) throw new Error('图表配置过大，请缩小数据范围')
  let parsed
  try { parsed = JSON.parse(source) } catch (error) { throw new Error('图表配置尚不是有效 JSON') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('图表配置需要是 JSON 对象')
  const option = cleanOption(parsed)
  const base = option.baseOption || option
  const series = Array.isArray(base.series) ? base.series : base.series ? [base.series] : []
  if (!series.length) throw new Error('图表配置缺少 series 数据')
  const checkSeries = items => {
    const list = Array.isArray(items) ? items : items ? [items] : []
    list.forEach(item => {
      if (!item || typeof item !== 'object' || !chartTypes.has(item.type)) {
        throw new Error('图表需要使用折线、柱状、饼图、K线等已支持的内置类型')
      }
    })
  }
  checkSeries(base.series)
  if (Array.isArray(option.options)) option.options.forEach(frame => checkSeries(frame.series))
  base.tooltip = { ...(base.tooltip || {}), renderMode: 'richText' }
  return {
    color: ['#e98750', '#5685cc', '#5ca78c', '#ac82c2', '#d6ad51', '#cb7689'],
    backgroundColor: theme === 'dark' ? '#292a2d' : '#fff',
    aria: { enabled: true },
    ...option
  }
}
