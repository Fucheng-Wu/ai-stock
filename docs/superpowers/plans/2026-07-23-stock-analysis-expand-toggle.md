# Stock Analysis Expand Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the native left-side expand arrow usable on both stock list pages while keeping the right-side “分析” action and allowing only one expanded stock at a time.

**Architecture:** Keep Element UI's native `type="expand"` table column as the single expand/collapse control and synchronize its `expand-change` event with each page's existing single-key array. Separate “load cached analysis when expanding” from “refresh analysis when clicking 分析” so the two controls have one clear responsibility each.

**Tech Stack:** Vue 2.6, Element UI 2.15, Node.js built-in `assert`, Vue CLI production build

---

## File Structure

- Create `ruoyi-ui/tests/stock-analysis-expand-toggle.test.js`: dependency-free source contract test for both Vue pages.
- Modify `ruoyi-ui/package.json`: expose the source contract test as `test:stock-expand`.
- Modify `ruoyi-ui/src/views/stock/watchlist/index.vue`: restore the native arrow column, synchronize native expand events, and keep “分析” as a refresh action.
- Modify `ruoyi-ui/src/views/stock/position/index.vue`: restore the native arrow column, load cached reports from arrow expansion, and keep “分析” as a refresh action.

### Task 1: Add Failing Expand-Control Contract Tests

**Files:**
- Create: `ruoyi-ui/tests/stock-analysis-expand-toggle.test.js`
- Modify: `ruoyi-ui/package.json`

- [ ] **Step 1: Write the failing source contract test**

Create `ruoyi-ui/tests/stock-analysis-expand-toggle.test.js`:

```js
const assert = require('assert')
const fs = require('fs')
const path = require('path')

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
}

const watchlist = read('src/views/stock/watchlist/index.vue')
const position = read('src/views/stock/position/index.vue')

assertSharedExpandContract(watchlist, 'watchlist')
assertSharedExpandContract(position, 'position')
assert(watchlist.includes('@click="handleAnalyze(scope.row)"'), 'watchlist must retain its analysis action')
assert(position.includes('@click="analyze(scope.row, false)"'), 'position must retain its analysis action')
assert(watchlist.includes('handleExpandChange(row, expandedRows)'), 'watchlist must handle native expansion')
assert(position.includes('handleExpandChange(row, expandedRows)'), 'position must handle native expansion')

console.log('stock analysis expand toggle contracts passed')
```

Add this script to `ruoyi-ui/package.json` immediately before `build:prod`:

```json
"test:stock-expand": "node tests/stock-analysis-expand-toggle.test.js",
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run:

```powershell
npm --prefix ruoyi-ui run test:stock-expand
```

Expected: FAIL because the current expand columns use `width="1"` and neither table binds `@expand-change`.

- [ ] **Step 3: Commit the failing contract**

```powershell
git add -- ruoyi-ui/tests/stock-analysis-expand-toggle.test.js ruoyi-ui/package.json
git commit -m "test: define stock analysis expand controls"
```

### Task 2: Restore the Watchlist Native Expand Control

**Files:**
- Modify: `ruoyi-ui/src/views/stock/watchlist/index.vue`
- Test: `ruoyi-ui/tests/stock-analysis-expand-toggle.test.js`

- [ ] **Step 1: Expose and bind the native expand column**

Update the watchlist table opening and expand column:

```vue
<el-table
  v-loading="loading"
  :data="rows"
  row-key="stockCode"
  :expand-row-keys="expandedCodes"
  class="watchlist-table"
  @expand-change="handleExpandChange"
>
  <el-table-column type="expand" width="48">
```

- [ ] **Step 2: Make the right-side action permanently mean analysis**

Keep the existing click handler but replace the conditional label with a fixed label:

```vue
<el-button type="text" icon="el-icon-data-analysis" @click="handleAnalyze(scope.row)">
  分析
</el-button>
```

- [ ] **Step 3: Separate native expansion from analysis refresh**

Replace the existing toggle behavior in `handleAnalyze` and add two focused methods:

```js
handleExpandChange(row, expandedRows) {
  const code = row.stockCode
  const isExpanded = expandedRows.some(item => item.stockCode === code)
  if (!isExpanded) {
    if (this.expandedCodes[0] === code) this.expandedCodes = []
    return
  }
  this.expandedCodes = [code]
  if (this.analysisByCode[code] || this.analysisLoading[code]) return
  this.loadAnalysis(row)
},
handleAnalyze(row) {
  this.expandedCodes = [row.stockCode]
  this.$set(this.aiShown, row.stockCode, false)
  this.loadAnalysis(row)
},
loadAnalysis(row) {
  const code = row.stockCode
  this.$set(this.analysisLoading, code, true)
  analyzeStock({ stockCode: code, includeAi: false }).then(res => {
    this.$set(this.analysisByCode, code, res.data)
  }).finally(() => {
    this.$set(this.analysisLoading, code, false)
  })
},
```

The native arrow now loads only when data is absent, while the right-side action always refreshes and expands the selected stock.

- [ ] **Step 4: Run the contract test and observe the remaining position failure**

Run:

```powershell
npm --prefix ruoyi-ui run test:stock-expand
```

Expected: FAIL on the position page contract; watchlist assertions pass.

- [ ] **Step 5: Commit the watchlist implementation**

```powershell
git add -- ruoyi-ui/src/views/stock/watchlist/index.vue
git commit -m "feat: add watchlist expand arrow control"
```

### Task 3: Restore the Position Native Expand Control

**Files:**
- Modify: `ruoyi-ui/src/views/stock/position/index.vue`
- Test: `ruoyi-ui/tests/stock-analysis-expand-toggle.test.js`

- [ ] **Step 1: Expose and bind the native expand column**

Update the position table opening and expand column:

```vue
<el-table
  v-loading="listLoading"
  :data="rows"
  row-key="positionId"
  :expand-row-keys="expanded"
  class="position-table"
  @expand-change="handleExpandChange"
>
  <el-table-column type="expand" width="48">
```

- [ ] **Step 2: Preserve the right-side analysis action without collapse semantics**

Replace the current `toggle` binding and conditional label:

```vue
<el-button
  v-hasPermi="['stock:position:analyze']"
  type="text"
  icon="el-icon-data-analysis"
  @click="analyze(scope.row, false)"
>分析</el-button>
```

- [ ] **Step 3: Convert the old toggle method into native expansion synchronization**

Replace `toggle(row)` with:

```js
handleExpandChange(row, expandedRows) {
  const id = row.positionId
  const isExpanded = expandedRows.some(item => item.positionId === id)
  if (!isExpanded) {
    if (this.expanded[0] === id) this.expanded = []
    return
  }
  this.expanded = [id]
  if (this.loaded[id] || this.loading[id]) return
  this.loadSavedAnalysis(row)
},
loadSavedAnalysis(row) {
  const id = row.positionId
  this.$set(this.loading, id, true)
  getPositionAnalysis(id).then(res => {
    if (res.data) this.$set(this.reports, id, res.data)
    this.$set(this.aiShown, id, Boolean(res.data && res.data.aiAdvice))
    this.$set(this.loaded, id, true)
  }).finally(() => {
    this.$set(this.loading, id, false)
  })
},
```

Keep the existing `analyze(row, includeAi)` method unchanged so clicking “分析” refreshes data and sets `this.expanded = [id]`.

- [ ] **Step 4: Run the contract test to verify both pages pass**

Run:

```powershell
npm --prefix ruoyi-ui run test:stock-expand
```

Expected: PASS with `stock analysis expand toggle contracts passed`.

- [ ] **Step 5: Commit the position implementation**

```powershell
git add -- ruoyi-ui/src/views/stock/position/index.vue
git commit -m "feat: add position expand arrow control"
```

### Task 4: Verify the Integrated Interaction

**Files:**
- Verify: `ruoyi-ui/src/views/stock/watchlist/index.vue`
- Verify: `ruoyi-ui/src/views/stock/position/index.vue`
- Verify: `ruoyi-ui/tests/stock-analysis-expand-toggle.test.js`

- [ ] **Step 1: Run the focused contract test from a clean command invocation**

```powershell
npm --prefix ruoyi-ui run test:stock-expand
```

Expected: exit code 0 and `stock analysis expand toggle contracts passed`.

- [ ] **Step 2: Run the frontend production build**

```powershell
npm --prefix ruoyi-ui run build:prod
```

Expected: exit code 0 and `Build complete`; existing asset-size warnings are acceptable.

- [ ] **Step 3: Check the rendered behavior in both pages**

With the local application running, verify on `/stock/watchlist` and `/stock/position`:

1. The far-left arrow points right when its row is collapsed.
2. Clicking it points the arrow down and displays the analysis row.
3. Clicking it again collapses the analysis row.
4. Expanding a second stock collapses the first stock.
5. The far-right action remains labeled “分析” before and after expansion.
6. Clicking “分析” refreshes data and expands that stock.
7. Reopening a cached row via the arrow does not show a new loading request.

- [ ] **Step 4: Inspect repository state and whitespace**

```powershell
git diff --check
git status --short
git log --oneline -5
```

Expected: no whitespace errors; only intended feature files differ or all intended files are committed.

