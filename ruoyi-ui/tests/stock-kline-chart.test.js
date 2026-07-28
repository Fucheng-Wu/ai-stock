const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

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
const componentSource = fs.readFileSync(componentPath, 'utf8').replace(/\r\n/g, '\n')
const analyzerPath = path.resolve(__dirname, '../src/views/stock/analyzer/index.vue')
const analyzerSource = fs.readFileSync(analyzerPath, 'utf8').replace(/\r\n/g, '\n')
const resultTemplateIndex = analyzerSource.indexOf('<template v-if="result && result.stock && !loading">')
const analyzerChartIndex = analyzerSource.indexOf('<stock-kline-chart', resultTemplateIndex)
const quoteCardIndex = analyzerSource.indexOf('class="stock-card quote-card"', resultTemplateIndex)

assert(resultTemplateIndex >= 0, 'analyzer must keep the successful-result template')
assert(analyzerChartIndex > resultTemplateIndex, 'analyzer must render the K-line chart inside the successful-result template')
assert(quoteCardIndex > analyzerChartIndex, 'K-line chart must be the first result card before the quote card')
assert(
  /<stock-kline-chart\s+:kline-data="result\.klineData \|\| \[\]"\s+:updated-at="formattedResultSavedAt"\s*\/>/s.test(analyzerSource),
  'analyzer must pass safe K-line data and the formatted saved timestamp to the chart'
)
assert(
  analyzerSource.includes("import StockKlineChart from './components/StockKlineChart.vue'"),
  'analyzer must import StockKlineChart'
)
assert(/components:\s*{\s*StockKlineChart\s*}/s.test(analyzerSource), 'analyzer must register StockKlineChart')
assert(!analyzerSource.includes('localStorage'), 'analyzer must not use localStorage')
const mountedMatch = componentSource.match(/mounted\(\)\s*{([\s\S]*?)\n  },\n  beforeDestroy\(\)/)
assert(mountedMatch, 'component must define a mounted lifecycle block')
const mountedSource = mountedMatch[1]

assert(componentSource.includes("import * as echarts from 'echarts'"), 'component must import echarts')
assert(componentSource.includes("import { buildStockKlineOption } from '@/utils/stock-kline'"), 'component must import the K-line option builder')
assert(componentSource.includes("name: 'StockKlineChart'"), 'component must use the StockKlineChart name')
assert(componentSource.includes('<el-card'), 'component template must use an Element card')
assert(componentSource.includes('class="stock-card stock-kline-chart"'), 'component card must use the stock-card and K-line card classes')
assert(/klineData:\s*{\s*type:\s*Array,\s*default:\s*\(\)\s*=>\s*\[\]/s.test(componentSource), 'klineData must be an Array prop with an empty-array factory default')
assert(/updatedAt:\s*{\s*type:\s*String,\s*default:\s*''/s.test(componentSource), 'updatedAt must be a String prop with an empty-string default')
assert(componentSource.includes('近三个月日 K'), 'component must render the K-line title')
assert(componentSource.includes('日 K、MA5 / MA10 / MA20 与成交量'), 'component must render the K-line description')
assert(componentSource.includes('`${klineData.length} 个交易日`'), 'component must render the real trading-day count')
assert(/<span class="stock-badge">\s*{{\s*`\$\{klineData\.length\} 个交易日`\s*}}\s*<\/span>/s.test(componentSource), 'trading-day count must be rendered inside the stock badge')
assert(componentSource.includes('v-if="updatedAt"'), 'component must conditionally render the update timestamp')
assert(componentSource.includes('更新时间'), 'component must render the update timestamp when supplied')
assert(componentSource.includes('v-if="hasKlineData"'), 'component must conditionally render the chart container')
assert(/hasKlineData\(\)\s*{\s*return this\.klineData\.length > 0/s.test(componentSource), 'chart rendering must depend on the K-line data length')
assert(componentSource.includes('v-else class="stock-kline-chart__empty"'), 'component must render an empty-state alternative')
assert(componentSource.includes('ref="chart"'), 'component must expose the chart container ref')
assert(componentSource.includes('暂无 K 线数据'), 'component must render the empty state')
assert(/watch:\s*{\s*klineData:\s*{\s*deep:\s*true,\s*handler\(\)\s*{\s*this\.\$nextTick\(\(\) => this\.renderChart\(\)\)/s.test(componentSource), 'klineData must deeply watch and defer rerendering until the DOM update')
assert(mountedSource.includes('this.$nextTick(() => this.renderChart())'), 'mounted must wait for the DOM update before rendering')
assert(mountedSource.includes("window.addEventListener('resize', this.handleResize)"), 'mounted must register the resize listener')
assert(/if\s*\(!this\.chart\)\s*{\s*this\.chart\s*=\s*echarts\.init\(chartElement\)/s.test(componentSource), 'renderChart must initialize ECharts only when no instance exists')
assert(componentSource.includes('this.chart.setOption(buildStockKlineOption(this.klineData), true)'), 'renderChart must update the reusable chart with K-line options')
assert(/handleResize\(\)\s*{\s*if \(this\.chart\)\s*{\s*this\.chart\.resize\(\)/s.test(componentSource), 'resize handler must resize the active chart')
assert(componentSource.includes("window.removeEventListener('resize', this.handleResize)"), 'component must remove the resize listener')
assert(/if \(!this\.hasKlineData\)\s*{\s*this\.disposeChart\(\)/s.test(componentSource), 'empty data must dispose the existing chart')
assert(/disposeChart\(\)\s*{\s*if \(this\.chart\)\s*{\s*this\.chart\.dispose\(\)\s*this\.chart = null/s.test(componentSource), 'disposing must release the chart and clear its reference')
assert(/data\(\)\s*{\s*return\s*{\s*chart: null,\s*isDestroyed: false/s.test(componentSource), 'component must track whether it has been destroyed')
assert(/beforeDestroy\(\)\s*{\s*this\.isDestroyed = true\s*window\.removeEventListener\('resize', this\.handleResize\)\s*this\.disposeChart\(\)/s.test(componentSource), 'beforeDestroy must mark destruction, remove the listener, and dispose the chart')
assert(/renderChart\(\)\s*{\s*if \(this\.isDestroyed\) return/s.test(componentSource), 'renderChart must ignore queued work after destruction')
assert(/\.stock-kline-chart__canvas\s*{\s*height: 520px/s.test(componentSource), 'desktop chart height must be 520px')
assert(/@media \(max-width: 768px\)[\s\S]*?\.stock-kline-chart__canvas\s*{\s*height: 420px/s.test(componentSource), 'mobile chart height must be 420px under the narrow breakpoint')
assert(/\.stock-kline-chart__empty\s*{\s*display: flex;\s*align-items: center;\s*justify-content: center;\s*min-height: 240px/s.test(componentSource), 'empty state must be centered with a 240px minimum height')
assert(/@media \(max-width: 768px\)[\s\S]*?\.stock-kline-chart__metadata\s*{\s*flex-wrap: wrap;/s.test(componentSource), 'metadata must wrap at the narrow breakpoint')
assert(componentSource.includes('<style lang="scss" scoped>'), 'component styles must be scoped')
assert(/@media \(max-width: 768px\)[\s\S]*?\.stock-kline-chart__metadata\s*{\s*justify-content: flex-start;\s*text-align: left;/s.test(componentSource), 'narrow metadata must align at the start and left')
assert(/@media \(max-width: 768px\)[\s\S]*?\.stock-kline-chart__updated-at\s*{\s*white-space: normal;/s.test(componentSource), 'narrow update metadata must allow wrapping')
assert(!componentSource.includes('analyzeStock'), 'component must not call the analysis API')
assert(!componentSource.includes('sessionStorage'), 'component must not access sessionStorage')

function evaluateKlineComponent(echarts, buildOption, windowMock) {
  const scriptMatch = componentSource.match(/<script>\s*([\s\S]*?)\s*<\/script>/)
  assert(scriptMatch, 'component must contain an executable script block')

  const executableScript = scriptMatch[1]
    .replace("import * as echarts from 'echarts'", 'const echarts = injectedEcharts')
    .replace("import { buildStockKlineOption } from '@/utils/stock-kline'", 'const buildStockKlineOption = injectedBuildOption')
    .replace('export default', 'module.exports =')
  const sandbox = {
    module: { exports: {} },
    injectedEcharts: echarts,
    injectedBuildOption: buildOption,
    window: windowMock
  }

  vm.runInNewContext(executableScript, sandbox, { filename: 'StockKlineChart.vue' })
  return sandbox.module.exports
}

function createLifecycleHarness(klineData) {
  const nextTickQueue = []
  const listenerEvents = { added: [], removed: [] }
  const charts = []
  const buildOptionCalls = []
  const windowMock = {
    addEventListener(type, handler) {
      listenerEvents.added.push({ type, handler })
    },
    removeEventListener(type, handler) {
      listenerEvents.removed.push({ type, handler })
    }
  }
  const echarts = {
    init(element) {
      const chart = {
        element,
        disposed: 0,
        resizeCalls: 0,
        setOptionCalls: [],
        setOption(option, replace) {
          this.setOptionCalls.push({ option, replace })
        },
        resize() {
          this.resizeCalls += 1
        },
        dispose() {
          this.disposed += 1
        }
      }
      charts.push(chart)
      return chart
    }
  }
  const buildOption = bars => {
    buildOptionCalls.push(bars)
    return { bars }
  }
  const definition = evaluateKlineComponent(echarts, buildOption, windowMock)
  const instance = {
    klineData,
    updatedAt: '',
    $refs: { chart: { id: 'chart-element' } },
    $nextTick(callback) {
      nextTickQueue.push(callback)
    }
  }

  Object.assign(instance, definition.data.call(instance))
  Object.keys(definition.methods).forEach(name => {
    instance[name] = definition.methods[name].bind(instance)
  })
  Object.defineProperty(instance, 'hasKlineData', {
    get() {
      return definition.computed.hasKlineData.call(instance)
    }
  })

  return {
    definition,
    instance,
    charts,
    buildOptionCalls,
    listenerEvents,
    flushNextTicks() {
      while (nextTickQueue.length) {
        nextTickQueue.shift()()
      }
    }
  }
}

const lifecycleBars = [{ date: '2026-07-27', open: 10, close: 11, high: 12, low: 9, volume: 1000 }]
const lifecycleHarness = createLifecycleHarness(lifecycleBars)
const lifecycleInstance = lifecycleHarness.instance
lifecycleHarness.definition.mounted.call(lifecycleInstance)
assert.deepStrictEqual(lifecycleHarness.listenerEvents.added.map(event => event.type), ['resize'], 'mounted must register the resize listener')
assert.strictEqual(lifecycleHarness.charts.length, 0, 'mounted must defer chart initialization until nextTick')
lifecycleHarness.flushNextTicks()
assert.strictEqual(lifecycleHarness.charts.length, 1, 'mounted must initialize one chart after nextTick')
assert.strictEqual(lifecycleHarness.charts[0].setOptionCalls.length, 1, 'mounted must set the initial option once')
assert.strictEqual(lifecycleHarness.charts[0].setOptionCalls[0].replace, true, 'chart options must replace prior options')

lifecycleInstance.klineData = lifecycleBars.concat({ date: '2026-07-28', open: 11, close: 10, high: 12, low: 9, volume: 800 })
lifecycleHarness.definition.watch.klineData.handler.call(lifecycleInstance)
lifecycleHarness.flushNextTicks()
assert.strictEqual(lifecycleHarness.charts.length, 1, 'watch updates must reuse the existing chart instance')
assert.strictEqual(lifecycleHarness.charts[0].setOptionCalls.length, 2, 'watch updates must set a fresh option')
assert.strictEqual(lifecycleHarness.buildOptionCalls[1], lifecycleInstance.klineData, 'watch updates must build options from the latest prop data')

lifecycleInstance.handleResize()
assert.strictEqual(lifecycleHarness.charts[0].resizeCalls, 1, 'resize handler must resize the active chart')

lifecycleInstance.klineData = []
lifecycleHarness.definition.watch.klineData.handler.call(lifecycleInstance)
lifecycleHarness.flushNextTicks()
assert.strictEqual(lifecycleHarness.charts[0].disposed, 1, 'empty data must dispose the existing chart')
assert.strictEqual(lifecycleInstance.chart, null, 'empty data must clear the chart reference')

lifecycleInstance.klineData = lifecycleBars
lifecycleHarness.definition.watch.klineData.handler.call(lifecycleInstance)
lifecycleHarness.flushNextTicks()
assert.strictEqual(lifecycleHarness.charts.length, 2, 'new nonempty data must initialize a replacement chart')
assert.strictEqual(lifecycleHarness.charts[1].setOptionCalls.length, 1, 'replacement chart must receive its initial option')

lifecycleHarness.definition.beforeDestroy.call(lifecycleInstance)
assert.deepStrictEqual(lifecycleHarness.listenerEvents.removed.map(event => event.type), ['resize'], 'beforeDestroy must remove the resize listener')
assert.strictEqual(lifecycleHarness.charts[1].disposed, 1, 'beforeDestroy must dispose the active chart')
assert.strictEqual(lifecycleInstance.chart, null, 'beforeDestroy must clear the chart reference')

const destroyedBeforeFlushHarness = createLifecycleHarness(lifecycleBars)
destroyedBeforeFlushHarness.definition.mounted.call(destroyedBeforeFlushHarness.instance)
destroyedBeforeFlushHarness.definition.beforeDestroy.call(destroyedBeforeFlushHarness.instance)
destroyedBeforeFlushHarness.flushNextTicks()
assert.strictEqual(destroyedBeforeFlushHarness.charts.length, 0, 'queued renders must not initialize a chart after destruction')
assert.strictEqual(destroyedBeforeFlushHarness.instance.chart, null, 'queued renders must leave a destroyed instance chartless')

console.log('stock kline chart contracts passed')
