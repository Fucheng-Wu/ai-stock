const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  WATCHLIST_ANALYSIS_CACHE_KEY,
  WATCHLIST_ANALYSIS_CACHE_TTL,
  saveWatchlistAnalysisCache,
  loadWatchlistAnalysisCache,
  removeWatchlistAnalysisCache
} = require('../src/utils/stock-watchlist-cache')

function createMemoryStorage() {
  const items = {}
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null },
    setItem(key, value) { items[key] = String(value) },
    read(key) { return items[key] }
  }
}

const storage = createMemoryStorage()
const result = { stock: { code: 'sh600519' }, klineData: [{ date: '2026-08-01', close: 100 }] }
const savedAt = 1000000

assert.strictEqual(WATCHLIST_ANALYSIS_CACHE_KEY, 'stock-watchlist:analysis-results')
assert.strictEqual(WATCHLIST_ANALYSIS_CACHE_TTL, 5 * 60 * 1000)
assert.strictEqual(saveWatchlistAnalysisCache(storage, 'SH600519', result, savedAt), true)
assert.deepStrictEqual(loadWatchlistAnalysisCache(storage, 'sh600519', savedAt + 1000), { result, savedAt })
assert.strictEqual(loadWatchlistAnalysisCache(storage, 'sh600519', savedAt + WATCHLIST_ANALYSIS_CACHE_TTL), null)

saveWatchlistAnalysisCache(storage, 'sh600519', result, savedAt)
assert.strictEqual(removeWatchlistAnalysisCache(storage, 'sh600519'), true)
assert.strictEqual(loadWatchlistAnalysisCache(storage, 'sh600519', savedAt + 1000), null)
assert.doesNotThrow(() => loadWatchlistAnalysisCache(null, 'sh600519'))
assert.strictEqual(saveWatchlistAnalysisCache(null, 'sh600519', result, savedAt), false)

const watchlist = fs.readFileSync(path.resolve(__dirname, '../src/views/stock/watchlist/index.vue'), 'utf8')
assert.ok(watchlist.includes('@click="handleRefresh"'), 'refresh action must explicitly refresh analysis data')
assert.ok(watchlist.includes('this.ensureAnalysis(row)'), 'row actions must reuse a fresh analysis cache')
assert.ok(watchlist.includes('loadWatchlistAnalysisCache(this.getSessionStorage(), code)'), 'cache must survive route changes in the same browser session')
assert.ok(watchlist.includes('Date.now() - savedAt < WATCHLIST_ANALYSIS_CACHE_TTL'), 'memory cache must expire')

const persisted = JSON.parse(storage.read(WATCHLIST_ANALYSIS_CACHE_KEY))
assert.deepStrictEqual(persisted, {})

console.log('stock watchlist analysis cache tests passed')
