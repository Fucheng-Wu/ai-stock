const assert = require('assert')
const fs = require('fs')
const path = require('path')

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

const componentPath = path.resolve(__dirname, '../src/views/stock/analyzer/components/StockKlineChart.vue')
assert(fs.existsSync(componentPath), 'StockKlineChart component must exist')
const componentSource = fs.readFileSync(componentPath, 'utf8')

assert(componentSource.includes("import * as echarts from 'echarts'"), 'component must import echarts')
assert(componentSource.includes("import { buildStockKlineOption } from '@/utils/stock-kline'"), 'component must import the K-line option builder')
assert(componentSource.includes("name: 'StockKlineChart'"), 'component must use the StockKlineChart name')
assert(componentSource.includes('klineData:'), 'component must define the klineData prop')
assert(componentSource.includes('updatedAt:'), 'component must define the updatedAt prop')
assert(componentSource.includes('近三个月日 K'), 'component must render the K-line title')
assert(componentSource.includes('日 K、MA5 / MA10 / MA20 与成交量'), 'component must render the K-line description')
assert(componentSource.includes('`${klineData.length} 个交易日`'), 'component must render the real trading-day count')
assert(componentSource.includes('更新时间'), 'component must render the update timestamp when supplied')
assert(componentSource.includes('ref="chart"'), 'component must expose the chart container ref')
assert(componentSource.includes('暂无 K 线数据'), 'component must render the empty state')
assert(componentSource.includes('buildStockKlineOption(this.klineData)'), 'component must build options from its prop data')
assert(componentSource.includes("window.addEventListener('resize'"), 'component must register a resize listener')
assert(componentSource.includes("window.removeEventListener('resize'"), 'component must remove the resize listener')
assert(componentSource.includes('.dispose()'), 'component must dispose its chart instance')
assert(componentSource.includes('this.chart = null'), 'component must clear the chart instance after disposal')
assert(componentSource.includes('height: 520px'), 'desktop chart height must be 520px')
assert(componentSource.includes('height: 420px'), 'mobile chart height must be 420px')
assert(!componentSource.includes('analyzeStock'), 'component must not call the analysis API')
assert(!componentSource.includes('sessionStorage'), 'component must not access sessionStorage')

console.log('stock kline chart contracts passed')
