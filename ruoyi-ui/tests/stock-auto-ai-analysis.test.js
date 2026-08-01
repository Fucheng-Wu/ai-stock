const fs = require('fs')
const path = require('path')
const assert = require('assert')

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')
const analyzer = read('src/views/stock/analyzer/index.vue')
const watchlist = read('src/views/stock/watchlist/index.vue')
const position = read('src/views/stock/position/index.vue')
const positionApi = read('src/api/stock/position.js')
const report = read('src/components/StockStrategyReport/index.vue')
const cache = read('src/utils/stock-ai-cache.js')

assert.ok(analyzer.includes('analyzeStock({ stockCode: code, includeAi: true })'))
assert.ok(watchlist.includes('analyzeStock({ stockCode: code, includeAi: true })'))
assert.ok(positionApi.includes('data:{includeAi}'))

for (const [name, source] of [['analyzer', analyzer], ['watchlist', watchlist], ['position', position]]) {
  assert.ok(source.includes('handleAiAnalyze'), `${name} must expose a manual AI analysis action`)
  assert.ok(source.includes('hasSameKline'), `${name} must compare K-line data before refreshing AI analysis`)
}
assert.ok(report.includes('@click="$emit(\'ai-analyze\')"'), 'AI analysis button must emit from the DeepSeek report')
assert.ok(cache.includes('JSON.stringify(previousKline) === JSON.stringify(currentKline)'), 'K-line equality must compare complete chart data')

assert.ok(!watchlist.includes('v-model="form.stockName"'), 'watchlist add form must only require a stock code')
assert.ok(watchlist.includes('addWatchlist({ stockCode })'), 'watchlist add request must not accept a manual stock name')

console.log('conditional AI analysis and watchlist add contracts passed')
