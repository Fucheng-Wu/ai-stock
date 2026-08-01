const UP_COLOR = '#E5484D'
const DOWN_COLOR = '#16A36A'
const MA_COLORS = ['#000000', '#F5C400', '#E5484D']

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null
  }

  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeBar(value) {
  const bar = value && typeof value === 'object' ? value : {}
  return {
    date: bar.date === undefined ? null : bar.date,
    open: toFiniteNumber(bar.open),
    close: toFiniteNumber(bar.close),
    high: toFiniteNumber(bar.high),
    low: toFiniteNumber(bar.low),
    volume: toFiniteNumber(bar.volume),
    ma5: toFiniteNumber(bar.ma5),
    ma10: toFiniteNumber(bar.ma10),
    ma20: toFiniteNumber(bar.ma20)
  }
}

function normalizeBars(klineData) {
  return Array.isArray(klineData) ? klineData.map(normalizeBar) : []
}

function formatDecimal(value) {
  return value === null ? '--' : value.toFixed(2)
}

function formatVolume(value) {
  return value === null ? '--' : String(value)
}

function formatKlineTooltip(bars, index) {
  const normalizedBars = normalizeBars(bars)
  const bar = normalizedBars[index] || normalizeBar()
  const previous = index > 0 ? normalizedBars[index - 1] : null
  const change = previous && previous.close !== null && previous.close !== 0 && bar.close !== null
    ? (((bar.close - previous.close) / previous.close) * 100).toFixed(2) + '%'
    : '--'

  return [
    '日期：' + (bar.date === null ? '--' : bar.date),
    '开盘：' + formatDecimal(bar.open),
    '最高：' + formatDecimal(bar.high),
    '最低：' + formatDecimal(bar.low),
    '收盘：' + formatDecimal(bar.close),
    '涨跌幅：' + change,
    '成交量：' + formatVolume(bar.volume),
    'MA5：' + formatDecimal(bar.ma5),
    'MA10：' + formatDecimal(bar.ma10),
    'MA20：' + formatDecimal(bar.ma20)
  ].join('<br/>')
}

function buildStockKlineOption(klineData) {
  const bars = normalizeBars(klineData)
  const dates = bars.map(bar => bar.date)
  const volumeData = bars.map(bar => ({
    value: bar.volume,
    itemStyle: {
      color: bar.close !== null && bar.open !== null && bar.close >= bar.open ? UP_COLOR : DOWN_COLOR
    }
  }))

  return {
    animation: false,
    legend: {
      data: ['MA5', 'MA10', 'MA20'],
      top: 'top'
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: params => formatKlineTooltip(bars, params[0] && params[0].dataIndex)
    },
    axisPointer: {
      link: [{ xAxisIndex: 'all' }]
    },
    grid: [
      { left: '10%', right: '8%', top: '8%', height: '58%' },
      { left: '10%', right: '8%', top: '72%', height: '14%' }
    ],
    xAxis: [
      { type: 'category', data: dates, boundaryGap: true, axisLine: { onZero: false } },
      { type: 'category', gridIndex: 1, data: dates, boundaryGap: true, axisLabel: { show: false }, axisLine: { onZero: false } }
    ],
    yAxis: [
      { scale: true },
      { scale: true, gridIndex: 1 }
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100 },
      { type: 'slider', xAxisIndex: [0, 1], start: 0, end: 100 }
    ],
    series: [
      {
        name: '日K',
        type: 'candlestick',
        data: bars.map(bar => [bar.open, bar.close, bar.low, bar.high]),
        itemStyle: { color: UP_COLOR, color0: DOWN_COLOR, borderColor: UP_COLOR, borderColor0: DOWN_COLOR }
      },
      { name: 'MA5', type: 'line', data: bars.map(bar => bar.ma5), showSymbol: false, itemStyle: { color: MA_COLORS[0] }, lineStyle: { color: MA_COLORS[0] }, emphasis: { itemStyle: { color: MA_COLORS[0] }, lineStyle: { color: MA_COLORS[0] } } },
      { name: 'MA10', type: 'line', data: bars.map(bar => bar.ma10), showSymbol: false, itemStyle: { color: MA_COLORS[1] }, lineStyle: { color: MA_COLORS[1] }, emphasis: { itemStyle: { color: MA_COLORS[1] }, lineStyle: { color: MA_COLORS[1] } } },
      { name: 'MA20', type: 'line', data: bars.map(bar => bar.ma20), showSymbol: false, itemStyle: { color: MA_COLORS[2] }, lineStyle: { color: MA_COLORS[2] }, emphasis: { itemStyle: { color: MA_COLORS[2] }, lineStyle: { color: MA_COLORS[2] } } },
      { name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: volumeData }
    ]
  }
}

module.exports = {
  buildStockKlineOption,
  formatKlineTooltip
}
