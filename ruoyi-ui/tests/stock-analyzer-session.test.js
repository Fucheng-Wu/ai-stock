const assert = require('assert')
const fs = require('fs')
const path = require('path')

const {
  STOCK_ANALYZER_SESSION_KEY,
  saveAnalysisSession,
  loadAnalysisSession
} = require('../src/utils/stock-analyzer-session')

function createMemoryStorage(initialItems) {
  const items = Object.assign({}, initialItems)

  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(items, key) ? items[key] : null
    },
    setItem(key, value) {
      items[key] = String(value)
    },
    read(key) {
      return items[key]
    }
  }
}

assert.strictEqual(STOCK_ANALYZER_SESSION_KEY, 'stock-analyzer:last-result')
assert.strictEqual(typeof saveAnalysisSession, 'function')
assert.strictEqual(typeof loadAnalysisSession, 'function')

const storage = createMemoryStorage()
const result = {
  stock: { code: 'sh600519', name: '贵州茅台' },
  klineData: [{ date: '2026-07-28', close: 1234.56 }]
}
const savedAt = 1785225600000

assert.strictEqual(saveAnalysisSession(storage, 'sh600519', result, savedAt), true)
assert.deepStrictEqual(JSON.parse(storage.read(STOCK_ANALYZER_SESSION_KEY)), {
  stockCode: 'sh600519',
  result,
  savedAt
})
assert.deepStrictEqual(loadAnalysisSession(storage), {
  stockCode: 'sh600519',
  result,
  savedAt
})

assert.strictEqual(loadAnalysisSession(createMemoryStorage()), null)
assert.strictEqual(loadAnalysisSession(createMemoryStorage({
  [STOCK_ANALYZER_SESSION_KEY]: '{invalid json'
})), null)

;[
  {},
  { stockCode: 600519, result, savedAt },
  { stockCode: 'sh600519', savedAt },
  { stockCode: 'sh600519', result: null, savedAt },
  { stockCode: 'sh600519', result: {}, savedAt },
  { stockCode: 'sh600519', result: { stock: null }, savedAt },
  { stockCode: 'sh600519', result, savedAt: '1785225600000' },
  { stockCode: 'sh600519', result, savedAt: null }
].forEach(payload => {
  const invalidStorage = createMemoryStorage({
    [STOCK_ANALYZER_SESSION_KEY]: JSON.stringify(payload)
  })
  assert.strictEqual(loadAnalysisSession(invalidStorage), null)
})

assert.strictEqual(loadAnalysisSession({
  getItem() {
    throw new Error('unavailable')
  }
}), null)

assert.strictEqual(saveAnalysisSession({
  setItem() {
    throw new Error('quota exceeded')
  }
}, 'sh600519', result, savedAt), false)

const circularResult = { stock: { code: 'sh600519' } }
circularResult.self = circularResult
assert.strictEqual(saveAnalysisSession(createMemoryStorage(), 'sh600519', circularResult, savedAt), false)

const defaultStorage = createMemoryStorage()
const beforeSave = Date.now()
assert.strictEqual(saveAnalysisSession(defaultStorage, 'sz000001', result), true)
const defaultPayload = JSON.parse(defaultStorage.read(STOCK_ANALYZER_SESSION_KEY))
const afterSave = Date.now()
assert.strictEqual(typeof defaultPayload.savedAt, 'number')
assert(Number.isFinite(defaultPayload.savedAt))
assert(defaultPayload.savedAt >= beforeSave && defaultPayload.savedAt <= afterSave)

const helperSource = fs.readFileSync(path.resolve(__dirname, '../src/utils/stock-analyzer-session.js'), 'utf8')
assert(!/\b(?:localStorage|sessionStorage)\b/.test(helperSource), 'helper must depend only on injected storage')

console.log('stock analyzer session contracts passed')
