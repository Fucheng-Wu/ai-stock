const assert = require('assert')
const fs = require('fs')
const path = require('path')
const {
  nextRequestVersion,
  isLatestRequest
} = require('../src/utils/request-version')

const uiRoot = path.resolve(__dirname, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(uiRoot, relativePath), 'utf8')
}

function assertSharedExpandContract(source, pageName) {
  assert(
    /<el-table[\s\S]*?@expand-change="handleExpandChange"/.test(source),
    `${pageName} must synchronize the native expand-change event`
  )
  assert(
    /<el-table-column\s+type="expand"\s+width="48">/.test(source),
    `${pageName} must expose a 48px native expand column`
  )
  assert(
    !source.includes("? '收起' : '分析'"),
    `${pageName} must not use the analysis action as a collapse toggle`
  )
  assert(
    source.includes('analysisRequestVersions: {}'),
    `${pageName} must track the latest analysis request per row`
  )
  assert(
    source.includes('nextRequestVersion(this.analysisRequestVersions'),
    `${pageName} must advance the request version before loading`
  )
  assert(
    source.includes('isLatestRequest(this.analysisRequestVersions'),
    `${pageName} must ignore stale analysis responses`
  )
}

const watchlist = read('src/views/stock/watchlist/index.vue')
const position = read('src/views/stock/position/index.vue')

assertSharedExpandContract(watchlist, 'watchlist')
assertSharedExpandContract(position, 'position')
assert(watchlist.includes('@click="handleAnalyze(scope.row)"'), 'watchlist must retain its analysis action')
assert(position.includes('@click="analyze(scope.row)"'), 'position must retain its analysis action')
assert(watchlist.includes('handleExpandChange(row, expandedRows)'), 'watchlist must handle native expansion')
assert(position.includes('handleExpandChange(row, expandedRows)'), 'position must handle native expansion')

const requestVersions = {}
const olderRequest = nextRequestVersion(requestVersions, '600519')
const newerRequest = nextRequestVersion(requestVersions, '600519')

assert.strictEqual(isLatestRequest(requestVersions, '600519', olderRequest), false)
assert.strictEqual(isLatestRequest(requestVersions, '600519', newerRequest), true)

console.log('stock analysis expand toggle contracts passed')
