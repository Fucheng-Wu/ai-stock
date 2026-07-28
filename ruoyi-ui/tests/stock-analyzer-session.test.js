const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')

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
  { stockCode: '', result, savedAt },
  { stockCode: '   ', result, savedAt },
  { stockCode: '\t\n', result, savedAt },
  { stockCode: 'sh600519', savedAt },
  { stockCode: 'sh600519', result: null, savedAt },
  { stockCode: 'sh600519', result: [], savedAt },
  { stockCode: 'sh600519', result: {}, savedAt },
  { stockCode: 'sh600519', result: { stock: null }, savedAt },
  { stockCode: 'sh600519', result: { stock: false }, savedAt },
  { stockCode: 'sh600519', result: { stock: 'sh600519' }, savedAt },
  { stockCode: 'sh600519', result: { stock: [] }, savedAt },
  { stockCode: 'sh600519', result, savedAt: 0 },
  { stockCode: 'sh600519', result, savedAt: -1 },
  { stockCode: 'sh600519', result, savedAt: 1.5 },
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

const analyzerSource = fs.readFileSync(path.resolve(__dirname, '../src/views/stock/analyzer/index.vue'), 'utf8')
assert(
  analyzerSource.includes("import { saveAnalysisSession, loadAnalysisSession } from '@/utils/stock-analyzer-session'"),
  'analyzer must import both session helpers'
)
assert(/resultSavedAt:\s*null/.test(analyzerSource), 'analyzer data must initialize resultSavedAt')
assert(
  /formattedResultSavedAt\(\)\s*{\s*if \(!this\.resultSavedAt\) return ''\s*return new Date\(this\.resultSavedAt\)\.toLocaleString\('zh-CN',\s*{\s*hour12:\s*false\s*}\)\s*}/s.test(analyzerSource),
  'analyzer must format the saved timestamp as a non-12-hour zh-CN datetime for display'
)
const createdSource = analyzerSource.match(/created\(\)\s*{([\s\S]*?)\n  },\n  methods:/)
assert(createdSource, 'analyzer must expose the created hook before methods')
assert(
  createdSource[1].indexOf('this.restoreLastAnalysis()') >= 0 &&
    createdSource[1].indexOf('this.restoreLastAnalysis()') < createdSource[1].indexOf('this.$route.query.stockCode'),
  'created must restore the last analysis before processing the route query'
)
assert(!analyzerSource.includes('removeItem'), 'analyzer must retain the prior successful cache while a request runs')
assert(!analyzerSource.includes('localStorage'), 'analyzer must not use localStorage')

function evaluateAnalyzer(options) {
  const scriptMatch = analyzerSource.match(/<script>\s*([\s\S]*?)\s*<\/script>/)
  assert(scriptMatch, 'analyzer must contain an executable script block')

  const executableScript = scriptMatch[1]
    .replace("import { analyzeStock } from '@/api/stock/analyzer'", 'const analyzeStock = injectedAnalyzeStock')
    .replace("import StockKlineChart from './components/StockKlineChart.vue'", 'const StockKlineChart = injectedStockKlineChart')
    .replace(
      "import { saveAnalysisSession, loadAnalysisSession } from '@/utils/stock-analyzer-session'",
      'const { saveAnalysisSession, loadAnalysisSession } = injectedSessionHelpers'
    )
    .replace('export default', 'module.exports =')
  const sandbox = {
    module: { exports: {} },
    injectedAnalyzeStock: options.analyzeStock,
    injectedStockKlineChart: {},
    injectedSessionHelpers: {
      saveAnalysisSession: options.saveAnalysisSession,
      loadAnalysisSession: options.loadAnalysisSession
    },
    window: options.window
  }

  vm.runInNewContext(executableScript, sandbox, { filename: 'stock-analyzer/index.vue' })
  return sandbox.module.exports
}

function createAnalyzerHarness(overrides) {
  const storage = overrides.storage || {}
  const definition = evaluateAnalyzer({
    analyzeStock: overrides.analyzeStock || (() => { throw new Error('unexpected analyzeStock call') }),
    saveAnalysisSession: overrides.saveAnalysisSession || (() => { throw new Error('unexpected saveAnalysisSession call') }),
    loadAnalysisSession: overrides.loadAnalysisSession || (() => null),
    window: { sessionStorage: storage }
  })
  const instance = Object.assign(definition.data(), {
    $route: { query: {} },
    $message: { warning() {} }
  })
  Object.keys(definition.methods).forEach(name => {
    instance[name] = definition.methods[name].bind(instance)
  })
  return { definition, instance, storage }
}

const restoredResult = {
  stock: { code: 'sh600519', openPrice: 10, prevClose: 9, high: 11, low: 8, volume: 100, amount: 1000 },
  klineData: [{ date: '2026-07-28', close: 10 }]
}
const restoredAt = 1785225600000
let restoredStorage
const restoreHarness = createAnalyzerHarness({
  loadAnalysisSession(storageArgument) {
    restoredStorage = storageArgument
    return { stockCode: 'sh600519', result: restoredResult, savedAt: restoredAt }
  }
})
let restoredMarketBuilds = 0
restoreHarness.instance.buildMarketData = () => { restoredMarketBuilds += 1 }
restoreHarness.instance.restoreLastAnalysis()
assert.strictEqual(restoredStorage, restoreHarness.storage, 'restore must read from window.sessionStorage')
assert.strictEqual(restoreHarness.instance.stockCode, 'sh600519')
assert.strictEqual(restoreHarness.instance.result, restoredResult)
assert.strictEqual(restoreHarness.instance.resultSavedAt, restoredAt)
assert.strictEqual(restoredMarketBuilds, 1, 'restore must rebuild market cards from the cached result')

const nullRestoreHarness = createAnalyzerHarness({ loadAnalysisSession: () => null })
nullRestoreHarness.instance.stockCode = 'unchanged'
nullRestoreHarness.instance.result = restoredResult
nullRestoreHarness.instance.resultSavedAt = restoredAt
let nullRestoreBuilds = 0
nullRestoreHarness.instance.buildMarketData = () => { nullRestoreBuilds += 1 }
nullRestoreHarness.instance.restoreLastAnalysis()
assert.strictEqual(nullRestoreHarness.instance.stockCode, 'unchanged')
assert.strictEqual(nullRestoreHarness.instance.result, restoredResult)
assert.strictEqual(nullRestoreHarness.instance.resultSavedAt, restoredAt)
assert.strictEqual(nullRestoreBuilds, 0, 'null cache must leave the current view unchanged')

let pendingThen
const requestStartHarness = createAnalyzerHarness({
  analyzeStock() {
    return {
      then(callback) { pendingThen = callback; return this },
      catch() { return this },
      finally() { return this }
    }
  }
})
requestStartHarness.instance.stockCode = ' sh600519 '
requestStartHarness.instance.result = restoredResult
requestStartHarness.instance.resultSavedAt = restoredAt
requestStartHarness.instance.handleAnalyze()
assert.strictEqual(typeof pendingThen, 'function', 'valid analysis must start the API promise chain')
assert.strictEqual(requestStartHarness.instance.result, null, 'request start must clear the displayed result')
assert.strictEqual(requestStartHarness.instance.resultSavedAt, null, 'request start must clear the displayed timestamp')

const successfulResult = { stock: { code: 'sz000001' }, klineData: [] }
const saveCalls = []
let analyzeArgument
let successMarketBuilds = 0
const successHarness = createAnalyzerHarness({
  analyzeStock(argument) {
    analyzeArgument = argument
    return {
      then(callback) { callback({ data: successfulResult }); return this },
      catch() { return this },
      finally(callback) { callback(); return this }
    }
  },
  saveAnalysisSession(...args) {
    saveCalls.push(args)
    return true
  }
})
successHarness.instance.stockCode = ' sz000001 '
successHarness.instance.buildMarketData = () => { successMarketBuilds += 1 }
successHarness.instance.handleAnalyze()
assert.strictEqual(analyzeArgument.stockCode, 'sz000001')
assert.strictEqual(successHarness.instance.result, successfulResult)
assert.strictEqual(successMarketBuilds, 1, 'successful analysis must build the market cards')
assert.strictEqual(typeof successHarness.instance.resultSavedAt, 'number')
assert.strictEqual(saveCalls.length, 1)
assert.strictEqual(saveCalls[0][0], successHarness.storage, 'successful analysis must save to window.sessionStorage')
assert.strictEqual(saveCalls[0][1], 'sz000001')
assert.strictEqual(saveCalls[0][2], successfulResult)
assert.strictEqual(saveCalls[0][3], successHarness.instance.resultSavedAt, 'saved cache must use the displayed result timestamp')
assert.strictEqual(successHarness.instance.loading, false, 'successful analysis must finish loading')

console.log('stock analyzer session contracts passed')
