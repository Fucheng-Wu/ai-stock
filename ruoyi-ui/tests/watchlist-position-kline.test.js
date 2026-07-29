const assert = require('assert')
const fs = require('fs')
const path = require('path')

const watchlistPath = path.resolve(__dirname, '../src/views/stock/watchlist/index.vue')
const watchlistSource = fs.readFileSync(watchlistPath, 'utf8').replace(/\r\n/g, '\n')
const analysisTemplateIndex = watchlistSource.indexOf('<template v-if="analysis(scope.row)">')
const klineChartIndex = watchlistSource.indexOf('<stock-kline-chart', analysisTemplateIndex)
const expandHeaderIndex = watchlistSource.indexOf('class="stock-expand-panel__header"', analysisTemplateIndex)

assert(
  watchlistSource.includes("import StockKlineChart from '@/views/stock/analyzer/components/StockKlineChart.vue'"),
  'watchlist must import the shared StockKlineChart component'
)
assert(/components:\s*{\s*StockKlineChart\s*}/s.test(watchlistSource), 'watchlist must register StockKlineChart')
assert(analysisTemplateIndex >= 0, 'watchlist must keep the successful-analysis template')
assert(klineChartIndex > analysisTemplateIndex, 'watchlist must render the K-line chart inside the successful-analysis template')
assert(klineChartIndex < expandHeaderIndex, 'watchlist K-line chart must render before the analysis header')
assert(
  /<stock-kline-chart\s+:kline-data="analysis\(scope\.row\)\.klineData \|\| \[\]"\s*\/>/s.test(watchlistSource),
  'watchlist must pass safe K-line data to the shared chart'
)
assert(!watchlistSource.includes('watchlistKlineData'), 'watchlist must not introduce duplicated K-line state')

const positionPath = path.resolve(__dirname, '../src/views/stock/position/index.vue')
const positionSource = fs.readFileSync(positionPath, 'utf8').replace(/\r\n/g, '\n')
const reportTemplateIndex = positionSource.indexOf('<template v-if="report(scope.row)">')
const positionKlineChartIndex = positionSource.indexOf('<stock-kline-chart', reportTemplateIndex)
const positionExpandHeaderIndex = positionSource.indexOf('class="stock-expand-panel__header"', reportTemplateIndex)

assert(
  positionSource.includes("import StockKlineChart from '@/views/stock/analyzer/components/StockKlineChart.vue'"),
  'position must import the shared StockKlineChart component'
)
assert(/components:\s*{\s*StockKlineChart\s*}/s.test(positionSource), 'position must register StockKlineChart')
assert(reportTemplateIndex >= 0, 'position must keep the saved-report template')
assert(positionKlineChartIndex > reportTemplateIndex, 'position must render the K-line chart inside the saved-report template')
assert(positionKlineChartIndex < positionExpandHeaderIndex, 'position K-line chart must render before the analysis header')
assert(
  /<stock-kline-chart\s+v-if="hasKlineData\(report\(scope\.row\)\)"\s+:kline-data="report\(scope\.row\)\.klineData"\s*\/>/s.test(positionSource),
  'position must pass the saved report K-line data to the shared chart when it exists'
)
assert(
  positionSource.includes('v-else class="stock-detail-panel stock-empty position-kline-empty"'),
  'position must show a K-line empty state for legacy reports'
)
assert(positionSource.includes('重新分析以生成 K 线图'), 'position must explain how legacy reports get K-line data')
assert(positionSource.includes('@click="analyze(scope.row, false)"'), 'position must allow reanalysis from the K-line empty state')
assert(
  /hasKlineData\(result\)\s*{\s*return Boolean\(result && Array\.isArray\(result\.klineData\) && result\.klineData\.length\)\s*}/s.test(positionSource),
  'position must detect saved report K-line data without separate state'
)
assert(!positionSource.includes('positionKlineData:'), 'position must not introduce duplicated K-line state')

console.log('watchlist and position K-line contracts passed')
