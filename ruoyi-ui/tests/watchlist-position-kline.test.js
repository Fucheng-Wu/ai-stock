const assert = require('assert')
const fs = require('fs')
const path = require('path')

const watchlistPath = path.resolve(__dirname, '../src/views/stock/watchlist/index.vue')
const watchlistSource = fs.readFileSync(watchlistPath, 'utf8').replace(/\r\n/g, '\n')
const analysisTemplateIndex = watchlistSource.indexOf('<template v-if="analysis(scope.row)">')
const overviewIndex = watchlistSource.indexOf('<stock-analysis-overview', analysisTemplateIndex)

assert(
  watchlistSource.includes("import StockAnalysisOverview from '@/components/StockAnalysisOverview'"),
  'watchlist must import the shared StockAnalysisOverview component'
)
assert(/components:\s*{\s*StockAnalysisOverview[,\s]/s.test(watchlistSource), 'watchlist must register StockAnalysisOverview')
assert(analysisTemplateIndex >= 0, 'watchlist must keep the successful-analysis template')
assert(
  overviewIndex > analysisTemplateIndex && /<stock-analysis-overview\s+:result="analysis\(scope\.row\)"\s*\/>/s.test(watchlistSource),
  'watchlist must pass its analysis to the shared overview'
)
assert(!watchlistSource.includes('watchlistKlineData'), 'watchlist must not introduce duplicated K-line state')

const positionPath = path.resolve(__dirname, '../src/views/stock/position/index.vue')
const positionSource = fs.readFileSync(positionPath, 'utf8').replace(/\r\n/g, '\n')
const reportTemplateIndex = positionSource.indexOf('<template v-if="report(scope.row)">')
const positionOverviewIndex = positionSource.indexOf('<stock-analysis-overview', reportTemplateIndex)

assert(
  positionSource.includes("import StockAnalysisOverview from '@/components/StockAnalysisOverview'"),
  'position must import the shared StockAnalysisOverview component'
)
assert(/components:\s*{\s*StockAnalysisOverview[,\s]/s.test(positionSource), 'position must register StockAnalysisOverview')
assert(reportTemplateIndex >= 0, 'position must keep the saved-report template')
assert(
  positionOverviewIndex > reportTemplateIndex && /<stock-analysis-overview\s+:result="report\(scope\.row\)"\s*\/>/s.test(positionSource),
  'position must pass its saved report to the shared overview'
)
assert(!positionSource.includes('positionKlineData:'), 'position must not introduce duplicated K-line state')

console.log('watchlist and position K-line contracts passed')
