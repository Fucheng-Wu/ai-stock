# Watchlist and Position K-Line Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the existing three-month daily K-line chart at the top of the on-demand analysis expansion on both the watchlist and position pages, including a migration prompt for position snapshots without chart data.

**Architecture:** Reuse `StockKlineChart.vue` as the only ECharts owner and feed it the `klineData` already returned in each page's analysis result. Keep the current single-row expansion and request-version guards; add only page-level rendering, a small validity helper for saved position snapshots, and source-contract regression tests.

**Tech Stack:** Vue 2.6, Element UI 2.15, ECharts 5.4, Node.js `assert` source-contract tests, Vue CLI production build.

---

## File Structure

- Create `ruoyi-ui/tests/watchlist-position-kline.test.js`: verifies component reuse, placement, safe data binding, and the position legacy-snapshot prompt.
- Modify `ruoyi-ui/package.json`: adds a focused `test:stock-list-kline` command.
- Modify `ruoyi-ui/src/views/stock/watchlist/index.vue`: imports/registers the shared chart and renders it first in an analyzed row.
- Modify `ruoyi-ui/src/views/stock/position/index.vue`: imports/registers the chart, detects valid saved K-line arrays, renders the chart first, and shows a re-analysis prompt for old snapshots.

No backend files change because `StockAnalysisResult.klineData` is already serialized in both live analyzer responses and position snapshot JSON.

### Task 1: Add the watchlist K-line contract

**Files:**
- Create: `ruoyi-ui/tests/watchlist-position-kline.test.js`
- Modify: `ruoyi-ui/package.json`
- Modify: `ruoyi-ui/src/views/stock/watchlist/index.vue`

- [ ] **Step 1: Write the failing watchlist contract test**

Create `ruoyi-ui/tests/watchlist-position-kline.test.js` with:

```js
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const uiRoot = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(uiRoot, relativePath), 'utf8').replace(/\r\n/g, '\n')

const watchlist = read('src/views/stock/watchlist/index.vue')
const watchlistResultIndex = watchlist.indexOf('<template v-if="analysis(scope.row)">')
const watchlistChartIndex = watchlist.indexOf('<stock-kline-chart', watchlistResultIndex)
const watchlistHeaderIndex = watchlist.indexOf('class="stock-expand-panel__header"', watchlistResultIndex)

assert(
  watchlist.includes("import StockKlineChart from '@/views/stock/analyzer/components/StockKlineChart.vue'"),
  'watchlist must import the shared K-line chart'
)
assert(/components:\s*{\s*StockKlineChart\s*}/s.test(watchlist), 'watchlist must register the shared K-line chart')
assert(watchlistResultIndex >= 0, 'watchlist must keep its successful analysis template')
assert(watchlistChartIndex > watchlistResultIndex, 'watchlist must render the chart inside the successful analysis template')
assert(watchlistHeaderIndex > watchlistChartIndex, 'watchlist chart must appear before the quote header')
assert(
  /<stock-kline-chart\s+:kline-data="analysis\(scope\.row\)\.klineData \|\| \[\]"\s*\/>/s.test(watchlist),
  'watchlist must pass the current row K-line data with an empty-array fallback'
)
assert(!watchlist.includes('watchlistKlineData:'), 'watchlist must not maintain a second cross-row chart state')

console.log('watchlist and position K-line contracts passed')
```

Add this script to `ruoyi-ui/package.json` after `test:stock-kline`:

```json
"test:stock-list-kline": "node tests/watchlist-position-kline.test.js",
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```powershell
npm run test:stock-list-kline
```

Working directory: `ruoyi-ui`

Expected: FAIL at `watchlist must import the shared K-line chart`, proving the page does not yet expose the feature.

- [ ] **Step 3: Implement the minimal watchlist integration**

At the start of the successful analysis template in `ruoyi-ui/src/views/stock/watchlist/index.vue`, before `stock-expand-panel__header`, add:

```vue
<stock-kline-chart :kline-data="analysis(scope.row).klineData || []" />
```

Add the shared component import after the analyzer API import:

```js
import StockKlineChart from '@/views/stock/analyzer/components/StockKlineChart.vue'
```

Register it directly below the component name:

```js
export default {
  name: 'StockWatchlist',
  components: {
    StockKlineChart
  },
```

Add spacing in the existing scoped style block:

```scss
.watchlist-analysis .stock-kline-chart {
  margin-bottom: 16px;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm run test:stock-list-kline
```

Expected: PASS with `watchlist and position K-line contracts passed`.

- [ ] **Step 5: Run the existing chart and expand contracts**

Run:

```powershell
npm run test:stock-kline
npm run test:stock-expand
```

Expected: both commands exit 0 and print their `contracts passed` messages.

- [ ] **Step 6: Commit the green watchlist slice**

```powershell
git add -- ruoyi-ui/package.json ruoyi-ui/tests/watchlist-position-kline.test.js ruoyi-ui/src/views/stock/watchlist/index.vue
git commit -m "feat: show kline chart in watchlist analysis"
```

### Task 2: Add the position chart and legacy-snapshot prompt

**Files:**
- Modify: `ruoyi-ui/tests/watchlist-position-kline.test.js`
- Modify: `ruoyi-ui/src/views/stock/position/index.vue`

- [ ] **Step 1: Extend the contract test with failing position assertions**

Insert before the final `console.log` in `ruoyi-ui/tests/watchlist-position-kline.test.js`:

```js
const position = read('src/views/stock/position/index.vue')
const positionResultIndex = position.indexOf('<template v-if="report(scope.row)">')
const positionChartIndex = position.indexOf('<stock-kline-chart', positionResultIndex)
const positionHeaderIndex = position.indexOf('class="stock-expand-panel__header"', positionResultIndex)

assert(
  position.includes("import StockKlineChart from '@/views/stock/analyzer/components/StockKlineChart.vue'"),
  'position must import the shared K-line chart'
)
assert(/components:\s*{\s*StockKlineChart\s*}/s.test(position), 'position must register the shared K-line chart')
assert(positionResultIndex >= 0, 'position must keep its saved analysis template')
assert(positionChartIndex > positionResultIndex, 'position must render the chart inside the saved analysis template')
assert(positionHeaderIndex > positionChartIndex, 'position chart or migration state must appear before the quote header')
assert(
  /<stock-kline-chart\s+v-if="hasKlineData\(report\(scope\.row\)\)"\s+:kline-data="report\(scope\.row\)\.klineData"\s*\/>/s.test(position),
  'position must pass valid K-line data from the current saved report'
)
assert(position.includes('v-else class="stock-detail-panel stock-empty position-kline-empty"'), 'position must render a legacy-snapshot alternative')
assert(position.includes('重新分析以生成 K 线图'), 'position must explain how to migrate an old snapshot')
assert(position.includes('@click="analyze(scope.row, false)"'), 'position migration action must request a fresh technical analysis')
assert(
  /hasKlineData\(result\)\s*{\s*return Boolean\(result && Array\.isArray\(result\.klineData\) && result\.klineData\.length\)\s*}/s.test(position),
  'position must accept only non-empty K-line arrays'
)
assert(!position.includes('positionKlineData:'), 'position must not maintain a second cross-row chart state')
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```powershell
npm run test:stock-list-kline
```

Working directory: `ruoyi-ui`

Expected: FAIL at `position must import the shared K-line chart`.

- [ ] **Step 3: Implement the minimal position integration**

At the start of the saved report template in `ruoyi-ui/src/views/stock/position/index.vue`, before `stock-expand-panel__header`, add:

```vue
<stock-kline-chart
  v-if="hasKlineData(report(scope.row))"
  :kline-data="report(scope.row).klineData"
/>
<section v-else class="stock-detail-panel stock-empty position-kline-empty">
  <i class="el-icon-data-line stock-empty__icon" />
  <div class="stock-empty__title">重新分析以生成 K 线图</div>
  <p class="stock-empty__description">这是一份不含 K 线数据的历史分析，原报告仍会保留。</p>
  <el-button
    v-hasPermi="['stock:position:analyze']"
    type="primary"
    plain
    icon="el-icon-refresh"
    :loading="loading[scope.row.positionId]"
    @click="analyze(scope.row, false)"
  >重新分析</el-button>
</section>
```

Add the shared component import after the position API imports:

```js
import StockKlineChart from '@/views/stock/analyzer/components/StockKlineChart.vue'
```

Register it directly below the component name:

```js
export default {
  name: 'StockPosition',
  components: {
    StockKlineChart
  },
```

Add the validity helper before `report(row)`:

```js
hasKlineData(result) {
  return Boolean(result && Array.isArray(result.klineData) && result.klineData.length)
},
```

Add scoped spacing while keeping the existing shared empty-state styles:

```scss
.position-analysis .stock-kline-chart,
.position-kline-empty {
  margin-bottom: 16px;
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm run test:stock-list-kline
```

Expected: PASS with `watchlist and position K-line contracts passed`.

- [ ] **Step 5: Run related regressions**

Run:

```powershell
npm run test:stock-kline
npm run test:stock-expand
npm run test:position-remove
```

Expected: all commands exit 0 and print their contract success messages.

- [ ] **Step 6: Commit the green position slice**

```powershell
git add -- ruoyi-ui/tests/watchlist-position-kline.test.js ruoyi-ui/src/views/stock/position/index.vue
git commit -m "feat: show kline chart in position analysis"
```

### Task 3: Full verification and browser acceptance

**Files:**
- Verify only; modify production files only if a failing test or browser observation is first captured as a regression test.

- [ ] **Step 1: Run every stock front-end contract**

Run from `ruoyi-ui`:

```powershell
npm run test:stock-kline
npm run test:stock-list-kline
npm run test:stock-session
npm run test:stock-expand
npm run test:position-remove
```

Expected: all five commands exit 0 with no assertion failures.

- [ ] **Step 2: Run the production build**

Run from `ruoyi-ui`:

```powershell
npm run build:prod
```

Expected: exit 0 and `Build complete`; existing bundle-size warnings are acceptable, new compile errors are not.

- [ ] **Step 3: Inspect the final diff and scope**

Run from the repository root:

```powershell
git diff --check HEAD~2..HEAD
git show --stat --oneline HEAD~2..HEAD
git status --short
```

Expected: the two feature commits contain only the four planned front-end files; the user's pre-existing `application.yml`, CSV, and old untracked plan remain untouched.

- [ ] **Step 4: Verify both pages in the in-app browser**

Open the locally running application and verify:

1. On “我的自选”, click “分析”; the chart is above the quote header and only one row is expanded.
2. Analyze a second watchlist stock; its dates and prices replace the first stock's chart without cross-row data.
3. On “我的持仓”, click “分析”; the chart is above the quote header.
4. Collapse and reopen the position; a saved snapshot with `klineData` renders without a new analysis request.
5. If a legacy snapshot is available, confirm its old report stays visible and the chart position shows the re-analysis prompt.
6. Check a narrow viewport for horizontal overflow.

If authentication or captcha blocks access, record the exact blocker and rely on the passing contract tests and build without bypassing authentication.

- [ ] **Step 5: Review requirements against the design**

Confirm each item in `docs/superpowers/specs/2026-07-29-watchlist-position-kline-design.md` has evidence from a test, build, diff, or browser check. Do not claim completion if any required item remains unverified.

