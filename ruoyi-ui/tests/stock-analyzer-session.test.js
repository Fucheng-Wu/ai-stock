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
  const windowMock = overrides.window || { sessionStorage: storage }
  const definition = evaluateAnalyzer({
    analyzeStock: overrides.analyzeStock || (() => { throw new Error('unexpected analyzeStock call') }),
    saveAnalysisSession: overrides.saveAnalysisSession || (() => { throw new Error('unexpected saveAnalysisSession call') }),
    loadAnalysisSession: overrides.loadAnalysisSession || (() => null),
    window: windowMock
  })
  const instance = Object.assign(definition.data(), {
    $route: { query: {} },
    $message: overrides.message || { warning() {} }
  })
  Object.keys(definition.methods).forEach(name => {
    instance[name] = definition.methods[name].bind(instance)
  })
  return { definition, instance, storage, window: windowMock }
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

function flushPromiseChain() {
  return new Promise(resolve => setImmediate(resolve))
}

function createDeferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function runAsyncPageContracts() {
  const securityError = new Error('session storage is blocked')
  securityError.name = 'SecurityError'
  const blockedWindow = {}
  Object.defineProperty(blockedWindow, 'sessionStorage', {
    get() {
      throw securityError
    }
  })
  const blockedResult = { stock: { code: 'sh600000' }, klineData: [] }
  let blockedMarketBuilds = 0
  const blockedStorageHarness = createAnalyzerHarness({
    window: blockedWindow,
    analyzeStock: () => Promise.resolve({ data: blockedResult }),
    saveAnalysisSession,
    loadAnalysisSession
  })
  blockedStorageHarness.instance.stockCode = 'sh600000'
  blockedStorageHarness.instance.result = restoredResult
  blockedStorageHarness.instance.resultSavedAt = restoredAt
  blockedStorageHarness.instance.buildMarketData = () => { blockedMarketBuilds += 1 }

  assert.doesNotThrow(
    () => blockedStorageHarness.instance.restoreLastAnalysis(),
    'restore must tolerate a sessionStorage getter that throws SecurityError'
  )
  assert.strictEqual(blockedStorageHarness.instance.stockCode, 'sh600000')
  assert.strictEqual(blockedStorageHarness.instance.result, restoredResult)
  assert.strictEqual(blockedStorageHarness.instance.resultSavedAt, restoredAt)
  assert.strictEqual(blockedMarketBuilds, 0, 'failed storage access must not rebuild or mutate restored cards')

  blockedStorageHarness.instance.handleAnalyze()
  await flushPromiseChain()
  assert.strictEqual(blockedStorageHarness.instance.result, blockedResult)
  assert.strictEqual(typeof blockedStorageHarness.instance.resultSavedAt, 'number')
  assert.strictEqual(blockedMarketBuilds, 1, 'successful analysis must still build cards when storage is blocked')
  assert.strictEqual(blockedStorageHarness.instance.loading, false, 'blocked persistence must not break request completion')

  const firstRequest = createDeferred()
  let overlapAnalyzeCalls = 0
  const overlapResult = { stock: { code: 'sh600519' }, klineData: [] }
  const overlapHarness = createAnalyzerHarness({
    analyzeStock() {
      overlapAnalyzeCalls += 1
      return overlapAnalyzeCalls === 1
        ? firstRequest.promise
        : Promise.resolve({ data: { stock: { code: 'sz000001' }, klineData: [] } })
    },
    saveAnalysisSession: () => true
  })
  overlapHarness.instance.stockCode = 'sh600519'
  overlapHarness.instance.handleAnalyze()
  assert.strictEqual(overlapHarness.instance.loading, true, 'first request must own the loading state while pending')
  const stateBeforeDuplicate = {
    loading: overlapHarness.instance.loading,
    errorMsg: overlapHarness.instance.errorMsg,
    result: overlapHarness.instance.result,
    resultSavedAt: overlapHarness.instance.resultSavedAt
  }

  overlapHarness.instance.stockCode = 'sz000001'
  overlapHarness.instance.handleAnalyze()
  assert.strictEqual(overlapAnalyzeCalls, 1, 'a loading analyzer must not start a duplicate request')
  assert.deepStrictEqual({
    loading: overlapHarness.instance.loading,
    errorMsg: overlapHarness.instance.errorMsg,
    result: overlapHarness.instance.result,
    resultSavedAt: overlapHarness.instance.resultSavedAt
  }, stateBeforeDuplicate, 'duplicate triggers must not mutate the active request state')
  assert.strictEqual(overlapHarness.instance.loading, true, 'duplicate trigger must not release the first request loading state')

  firstRequest.resolve({ data: overlapResult })
  await flushPromiseChain()
  assert.strictEqual(overlapHarness.instance.result, overlapResult)
  assert.strictEqual(overlapHarness.instance.loading, false, 'loading must clear only after the first request settles')

  let blankAnalyzeCalls = 0
  let blankWarnings = 0
  const blankHarness = createAnalyzerHarness({
    analyzeStock() {
      blankAnalyzeCalls += 1
      return Promise.resolve({ data: overlapResult })
    },
    message: { warning() { blankWarnings += 1 } }
  })
  blankHarness.instance.stockCode = '   '
  blankHarness.instance.handleAnalyze()
  assert.strictEqual(blankAnalyzeCalls, 0, 'blank stock code must not start analysis')
  assert.strictEqual(blankWarnings, 1, 'blank stock code must retain its validation warning')

  assert(
    /handleAnalyze\(\)\s*{\s*if \(this\.loading\) return\s*const code = this\.stockCode\.trim\(\)/s.test(analyzerSource),
    'handleAnalyze must reject loading-state reentry before validation or request mutation'
  )

  const storageAccessorSource = analyzerSource.match(/getSessionStorage\(\)\s*{([\s\S]*?)\n    },/)
  assert(storageAccessorSource, 'analyzer must expose a guarded session storage accessor')
  assert(/try\s*{\s*return window\.sessionStorage\s*}\s*catch \([^)]*\)\s*{\s*return null\s*}/s.test(storageAccessorSource[1]))
  assert.strictEqual(
    (analyzerSource.match(/window\.sessionStorage/g) || []).length,
    1,
    'raw window.sessionStorage access must exist only inside the guarded accessor'
  )
}

runAsyncPageContracts().then(() => {
  console.log('stock analyzer session contracts passed')
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
