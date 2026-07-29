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

console.log('watchlist and position K-line contracts passed')
