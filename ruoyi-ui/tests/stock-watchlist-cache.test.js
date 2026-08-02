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
const watchlistApi = fs.readFileSync(path.resolve(__dirname, '../src/api/stock/watchlist.js'), 'utf8')
assert.ok(watchlist.includes('@click="handleRefresh"'), 'refresh action must explicitly refresh analysis data')
assert.ok(watchlist.includes('this.loadSavedAnalysis(row)'), 'expanding a row must load its saved database snapshot')
assert.ok(watchlist.includes('getWatchlistAnalysis(id)'), 'saved analysis must be requested by watchlist id')
assert.ok(watchlist.includes('analyzeWatchlist(id, false)'), 'fresh technical analysis must use the snapshot endpoint')
assert.ok(!watchlist.includes('window.sessionStorage'), 'the page must not depend on browser session storage')
assert.ok(watchlistApi.includes('`/stock/watchlist/${id}/analysis`'), 'watchlist API must expose snapshot reads')
assert.ok(watchlistApi.includes('`/stock/watchlist/${id}/analyze`'), 'watchlist API must expose persisted analysis')

const persisted = JSON.parse(storage.read(WATCHLIST_ANALYSIS_CACHE_KEY))
assert.deepStrictEqual(persisted, {})

console.log('stock watchlist analysis cache tests passed')
