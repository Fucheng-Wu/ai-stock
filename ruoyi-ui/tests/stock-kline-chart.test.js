const assert = require('assert')

let chartUtils = {}
try {
  chartUtils = require('../src/utils/stock-kline')
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') {
    throw error
  }
}

const { buildStockKlineOption, formatKlineTooltip } = chartUtils

const bars = [
  { date: '2026-07-27', open: 10, close: 11, high: 12, low: 9, volume: 1000, ma5: 10.1, ma10: 9.9, ma20: 9.5 },
  { date: '2026-07-28', open: 11, close: 10, high: 11.5, low: 9.5, volume: 800, ma5: 10.2, ma10: 10, ma20: 9.6 }
]

assert.strictEqual(typeof buildStockKlineOption, 'function', 'buildStockKlineOption must be exported')
assert.strictEqual(typeof formatKlineTooltip, 'function', 'formatKlineTooltip must be exported')

const option = buildStockKlineOption(bars)
assert.deepStrictEqual(option.xAxis[0].data, ['2026-07-27', '2026-07-28'])
assert.deepStrictEqual(option.series[0].data, [[10, 11, 9, 12], [11, 10, 9.5, 11.5]])
assert.deepStrictEqual(option.series[1].data, [10.1, 10.2])
assert.deepStrictEqual(option.series[2].data, [9.9, 10])
assert.deepStrictEqual(option.series[3].data, [9.5, 9.6])
assert.deepStrictEqual(option.series.map(series => series.name), ['日K', 'MA5', 'MA10', 'MA20', '成交量'])
assert.deepStrictEqual(option.legend.data, ['MA5', 'MA10', 'MA20'])
assert.strictEqual(option.legend.top, 'top')
assert.strictEqual(option.series[0].type, 'candlestick')
assert.strictEqual(option.series[4].type, 'bar')
assert.strictEqual(option.series[1].showSymbol, false)
assert.strictEqual(option.series[2].showSymbol, false)
assert.strictEqual(option.series[3].showSymbol, false)
assert.notStrictEqual(option.series[1].lineStyle.color, option.series[2].lineStyle.color)
assert.notStrictEqual(option.series[2].lineStyle.color, option.series[3].lineStyle.color)
assert.strictEqual(option.series[0].itemStyle.color, '#E5484D')
assert.strictEqual(option.series[0].itemStyle.color0, '#16A36A')
assert.strictEqual(option.series[4].data[0].itemStyle.color, '#E5484D')
assert.strictEqual(option.series[4].data[1].itemStyle.color, '#16A36A')
assert.deepStrictEqual(option.axisPointer.link, [{ xAxisIndex: 'all' }])
assert.strictEqual(option.dataZoom.length, 2)
option.dataZoom.forEach(zoom => {
  assert.deepStrictEqual(zoom.xAxisIndex, [0, 1])
  assert.strictEqual(zoom.start, 0)
  assert.strictEqual(zoom.end, 100)
})
assert.strictEqual(option.grid.length, 2)
assert.strictEqual(option.xAxis.length, 2)
assert.strictEqual(option.yAxis.length, 2)
option.xAxis.forEach(axis => assert.strictEqual(axis.boundaryGap, true))
assert.strictEqual(option.animation, false)

const firstTooltip = formatKlineTooltip(bars, 0)
const secondTooltip = formatKlineTooltip(bars, 1)
assert(firstTooltip.includes('涨跌幅：--'))
assert(secondTooltip.includes('涨跌幅：-9.09%'))
assert(secondTooltip.includes('MA20：9.60'))

const emptyOption = buildStockKlineOption(null)
assert.deepStrictEqual(emptyOption.xAxis[0].data, [])
assert.deepStrictEqual(emptyOption.series[0].data, [])
const nonArrayOption = buildStockKlineOption({})
assert.deepStrictEqual(nonArrayOption.xAxis[0].data, [])
assert.deepStrictEqual(nonArrayOption.series[4].data, [])

const invalidBars = [{ date: 'bad', open: null, close: 'not-a-number', high: Infinity, low: undefined, volume: null, ma5: null, ma10: '', ma20: NaN }]
const invalidOption = buildStockKlineOption(invalidBars)
assert.deepStrictEqual(invalidOption.series[0].data, [[null, null, null, null]])
assert.strictEqual(invalidOption.series[4].data[0].value, null)
const invalidTooltip = formatKlineTooltip(invalidBars, 0)
assert(invalidTooltip.includes('开盘：--'))
assert(invalidTooltip.includes('收盘：--'))
assert(invalidTooltip.includes('MA5：--'))
assert(!invalidTooltip.includes('0.00'))

console.log('stock kline chart contracts passed')
