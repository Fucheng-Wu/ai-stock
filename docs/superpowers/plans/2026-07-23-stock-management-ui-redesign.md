# Stock Management UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the AI analysis, watchlist, and position pages with one responsive, enterprise-grade visual system while preserving all current APIs, permissions, and business behavior.

**Architecture:** Add one stock-module SCSS file containing shared design tokens and reusable presentation primitives, then refactor each existing Vue single-file component to consume those primitives. Keep request state and domain-specific computed presentation inside each page so the redesign does not introduce shared runtime state or backend changes.

**Tech Stack:** Vue 2.6, Element UI 2.15, SCSS, existing RuoYi request/modal utilities

---

## File map

- Create `ruoyi-ui/src/assets/styles/stock-management.scss`: stock-module tokens, page shell, cards, metrics, status treatments, empty states, responsive rules.
- Modify `ruoyi-ui/src/views/stock/analyzer/index.vue`: rebuild analyzer page layout and harden display formatting.
- Modify `ruoyi-ui/src/views/stock/watchlist/index.vue`: rebuild add toolbar, table, empty state, and expanded analysis panel.
- Modify `ruoyi-ui/src/views/stock/position/index.vue`: rebuild asset summary, table, dialogs, and expanded position report.
- No API, Java, SQL, router, or permission files change.

### Task 1: Establish the shared stock visual system

**Files:**
- Create: `ruoyi-ui/src/assets/styles/stock-management.scss`

- [ ] **Step 1: Confirm the style file does not already exist**

Run:

```powershell
Test-Path 'ruoyi-ui/src/assets/styles/stock-management.scss'
```

Expected: `False`.

- [ ] **Step 2: Add module-scoped design tokens and layout primitives**

Create the file with a `.stock-page` root and the following concrete groups:

```scss
.stock-page {
  --stock-primary: #2563eb;
  --stock-primary-soft: #eff6ff;
  --stock-bg: #f5f7fa;
  --stock-card: #ffffff;
  --stock-text: #172033;
  --stock-muted: #667085;
  --stock-border: #e7eaf0;
  --stock-up: #e5484d;
  --stock-down: #16a36a;
  --stock-warning: #f59e0b;

  min-height: calc(100vh - 84px);
  padding: 24px;
  background: var(--stock-bg);
  color: var(--stock-text);
}

.stock-page__header,
.stock-card__header,
.stock-toolbar,
.stock-identity,
.stock-actions {
  display: flex;
  align-items: center;
}

.stock-page__header {
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}

.stock-card {
  margin-bottom: 16px;
  border: 1px solid var(--stock-border);
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(23, 32, 51, 0.04);
}

.stock-metric-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

.stock-metric {
  min-width: 0;
  padding: 16px;
  border: 1px solid var(--stock-border);
  border-radius: 8px;
  background: var(--stock-card);
}

.stock-number { font-variant-numeric: tabular-nums; }
.stock-up { color: var(--stock-up) !important; }
.stock-down { color: var(--stock-down) !important; }
.stock-empty { padding: 56px 20px; text-align: center; }
```

Also define title/subtitle, toolbar, badge, summary, detail-grid, rule-list, report, table cell, dialog, and hover primitives under `.stock-page`. Add breakpoints at 1200px, 768px, and 480px that reduce the six-column metric grid to 3, 2, and 1 columns, stack headers/toolbars, and make primary mobile actions full width.

- [ ] **Step 3: Validate SCSS syntax through the production compiler**

Temporarily no page imports the file, so validate that braces and selectors are balanced:

```powershell
$text = Get-Content -Raw 'ruoyi-ui/src/assets/styles/stock-management.scss'
if (($text.ToCharArray() | Where-Object { $_ -eq '{' }).Count -ne ($text.ToCharArray() | Where-Object { $_ -eq '}' }).Count) { throw 'Unbalanced SCSS braces' }
```

Expected: command exits successfully without output.

- [ ] **Step 4: Commit the shared style foundation**

```powershell
git add -- 'ruoyi-ui/src/assets/styles/stock-management.scss'
git commit -m "style: add stock management design system"
```

### Task 2: Rebuild the AI analysis page

**Files:**
- Modify: `ruoyi-ui/src/views/stock/analyzer/index.vue`
- Reference: `ruoyi-ui/src/api/stock/analyzer.js`

- [ ] **Step 1: Capture behavior-preservation checks before editing**

Run:

```powershell
rg -n "analyzeStock|stockCode|includeAi|stock:analyzer|\$route.query.stockCode" 'ruoyi-ui/src/views/stock/analyzer/index.vue'
```

Expected: the page still imports `analyzeStock`, reads `stockCode`, and supports the route query. Save this output for comparison after the refactor.

- [ ] **Step 2: Replace the page template with the approved hierarchy**

Use `<div class="stock-page analyzer-page">` as the root and import the shared SCSS. Implement these sections in order:

```vue
<header class="stock-page__header">
  <div>
    <div class="stock-page__eyebrow">520 均线策略</div>
    <h1 class="stock-page__title">AI 股票分析</h1>
    <p class="stock-page__subtitle">结合均线趋势、交易信号与 AI 建议辅助决策</p>
  </div>
  <div class="stock-toolbar analyzer-search">
    <el-input v-model="stockCode" clearable placeholder="输入 600519 或 sh600519"
      @keyup.enter.native="handleAnalyze" />
    <el-button type="primary" icon="el-icon-search" :loading="loading"
      @click="handleAnalyze">开始分析</el-button>
  </div>
</header>
```

Then render:

- a neutral quote summary card with name/code, current price, change amount/percentage, and update time;
- a six-item `.stock-metric-grid` from `marketData`;
- a two-column detail grid for MA data and signal judgment;
- an AI report card with risk badge, advice summary, and reason text;
- a compact six-item discipline list;
- an `el-empty` initial state when `result` is absent and loading is false.

Preserve `v-loading`, the error alert, route-driven auto-analysis, and all existing result fields.

- [ ] **Step 3: Harden formatting without changing request behavior**

Add display-only helpers and use them in `buildMarketData`:

```js
formatNumber(value, digits = 2) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(digits) : '--'
},
formatVolume(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '--'
  if (number >= 100000000) return `${(number / 100000000).toFixed(2)} 亿`
  if (number >= 10000) return `${(number / 10000).toFixed(2)} 万`
  return number.toLocaleString()
},
formatAmount(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '--'
  if (number >= 100000000) return `${(number / 100000000).toFixed(2)} 亿`
  if (number >= 10000) return `${(number / 10000).toFixed(2)} 万`
  return number.toLocaleString()
}
```

Keep `handleAnalyze()` request arguments unchanged. Replace page-specific color classes with shared `.stock-up` and `.stock-down` classes while retaining signal/risk/advice mappings.

- [ ] **Step 4: Replace legacy scoped styles with page-specific layout only**

Use:

```vue
<style lang="scss" scoped>
@import "~@/assets/styles/stock-management.scss";

.analyzer-search { width: min(100%, 520px); }
.analyzer-search .el-input { flex: 1; }
.quote-price { font-size: 36px; font-weight: 600; }
.strategy-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

@media (max-width: 768px) {
  .strategy-grid { grid-template-columns: 1fr; }
  .quote-price { font-size: 30px; }
}
</style>
```

Do not restore the former purple gradient, always-on shadows, or hover translation on every metric.

- [ ] **Step 5: Build and compare preserved behaviors**

Run:

```powershell
npm run build:prod
```

Working directory: `ruoyi-ui`.

Expected: `Build complete` with no Vue template or SCSS errors.

Then run:

```powershell
rg -n "analyzeStock|stockCode|\$route.query.stockCode|handleAnalyze|buildMarketData" 'ruoyi-ui/src/views/stock/analyzer/index.vue'
```

Expected: all preserved behavior hooks remain present.

- [ ] **Step 6: Commit the analyzer redesign**

```powershell
git add -- 'ruoyi-ui/src/views/stock/analyzer/index.vue'
git commit -m "style: redesign stock analyzer page"
```

### Task 3: Rebuild the watchlist page

**Files:**
- Modify: `ruoyi-ui/src/views/stock/watchlist/index.vue`
- Reference: `ruoyi-ui/src/api/stock/watchlist.js`

- [ ] **Step 1: Capture behavior-preservation checks before editing**

Run:

```powershell
rg -n "v-hasPermi|addWatchlist|listWatchlist|removeWatchlist|includeAi|expandedCodes" 'ruoyi-ui/src/views/stock/watchlist/index.vue'
```

Expected: list/add/remove permissions and requests, non-AI analysis, AI analysis, and single-row expansion are all present.

- [ ] **Step 2: Rebuild the page header, add toolbar, and table**

Use `.stock-page` and import the shared SCSS. The header displays “我的自选”, a subtitle, and a count badge using `rows.length`. Put the add form inside a `.stock-card.stock-toolbar-card` with three controls: code, optional name, and the permission-protected primary add button.

Configure the table with `stripe="false"`, a custom empty slot, and these columns:

```vue
<el-table-column label="股票" min-width="220">
  <template slot-scope="scope">
    <div class="stock-identity">
      <span class="stock-avatar">{{ stockInitial(scope.row) }}</span>
      <div>
        <strong>{{ scope.row.stockName || '未命名股票' }}</strong>
        <small>{{ scope.row.stockCode }}</small>
      </div>
    </div>
  </template>
</el-table-column>
<el-table-column label="加入时间" prop="createTime" min-width="180" />
<el-table-column label="操作" width="180" align="right">
  <!-- preserve analyze and permission-protected remove actions -->
</el-table-column>
```

Use `el-empty description="还没有自选股票"` in the empty slot and keep the hidden native expand column required by `expand-row-keys`.

- [ ] **Step 3: Rebuild the expanded analysis panel**

Render the current analysis data in four bounded sections:

1. quote identity with current price and percentage;
2. six market metrics plus MA5, MA20, and trend;
3. signal summary with confidence, suggested position, and reason;
4. compact discipline list and the AI analysis action/report.

Continue calling `analyzeStock({ stockCode: code, includeAi: false })` from `handleAnalyze` and `analyzeStock({ stockCode: code, includeAi: true })` from `handleAiAnalyze`.

- [ ] **Step 4: Add safe presentation helpers**

Add:

```js
stockInitial(row) {
  const text = row.stockName || row.stockCode || '股'
  return text.slice(0, 1).toUpperCase()
},
changeClass(stock) {
  return Number(stock && stock.changePct) >= 0 ? 'stock-up' : 'stock-down'
},
display(value) {
  return value === null || value === undefined || value === '' ? '--' : value
}
```

Make `analysis(row)` tolerate a missing row or code. Preserve `this.$set` for Vue 2 reactivity.

- [ ] **Step 5: Compile and verify permissions/requests**

Run `npm run build:prod` from `ruoyi-ui`.

Expected: `Build complete`.

Run:

```powershell
rg -n "stock:watchlist:add|stock:watchlist:remove|includeAi: false|includeAi: true|removeWatchlist" 'ruoyi-ui/src/views/stock/watchlist/index.vue'
```

Expected: every permission and request behavior is still present.

- [ ] **Step 6: Commit the watchlist redesign**

```powershell
git add -- 'ruoyi-ui/src/views/stock/watchlist/index.vue'
git commit -m "style: redesign stock watchlist page"
```

### Task 4: Rebuild the position page

**Files:**
- Modify: `ruoyi-ui/src/views/stock/position/index.vue`
- Reference: `ruoyi-ui/src/api/stock/position.js`

- [ ] **Step 1: Capture behavior-preservation checks before editing**

Run:

```powershell
rg -n "listPosition|addPosition|updatePosition|account|saveAccount|analyzePosition|getPositionAnalysis|v-hasPermi" 'ruoyi-ui/src/views/stock/position/index.vue'
```

Expected: all current API calls are present. Note that existing buttons may lack permission directives; the redesign must add only directives matching permissions already declared in `sql/stock_menu.sql`.

- [ ] **Step 2: Expand the script into readable state, computed values, and methods**

Preserve all state keys and add computed presentation values:

```js
computed: {
  totalAssets() {
    const value = Number(this.accountForm.totalAssets)
    return Number.isFinite(value) ? value : null
  },
  totalCost() {
    return this.rows.reduce((sum, row) => {
      const cost = Number(row.costPrice)
      const quantity = Number(row.quantity)
      return sum + (Number.isFinite(cost * quantity) ? cost * quantity : 0)
    }, 0)
  }
}
```

Do not call new endpoints or label `totalCost` as live market value. Add `formatMoney`, `display`, `profitClass`, and `stockInitial` helpers. Keep all existing CRUD/analyze request payloads unchanged.

- [ ] **Step 3: Rebuild the asset header and positions table**

Use a header with title/subtitle and two buttons:

- “账户总资产” as secondary action;
- “新增持仓” as primary action protected by `stock:position:add`.

Render an overview grid containing configured total assets, recorded cost total, position count, and asset-configuration status. Use an explicit “未配置” value when total assets is absent.

Render the table with stock identity, cost price, quantity, position percentage, and actions. Add the existing edit permission `stock:position:edit` and analyze permission `stock:position:analyze`. Use a compact progress bar for a valid percentage and `--` for a missing percentage.

- [ ] **Step 4: Rebuild the expanded position report**

Keep the single-row expansion and lazy saved-report loading. Group report fields into:

- quote and OHLC summary;
- MA5/MA20 and 20-day trend;
- cost amount, market value, floating profit/loss, profit percentage, and position percentage;
- volume ratio, contraction ratio, range, and index trend when indicators exist;
- signal description/reason;
- AI action and report.

Apply `.stock-up` or `.stock-down` to both floating amount and percentage. Missing `holding` or `indicators` objects must not throw during render.

- [ ] **Step 5: Standardize all three dialogs**

For add, account, and edit dialogs:

- use `custom-class="stock-dialog"`;
- use `label-width="88px"`;
- make inputs and input numbers full width;
- use `@closed` only for local form reset when needed;
- keep cancel as default and save as primary;
- retain existing validation messages and request payloads.

- [ ] **Step 6: Compile and verify permissions/requests**

Run `npm run build:prod` from `ruoyi-ui`.

Expected: `Build complete`.

Run:

```powershell
rg -n "stock:position:add|stock:position:edit|stock:position:analyze|listPosition|addPosition|updatePosition|saveAccount|analyzePosition|getPositionAnalysis" 'ruoyi-ui/src/views/stock/position/index.vue'
```

Expected: permissions and every existing request remain present.

- [ ] **Step 7: Commit the position redesign**

```powershell
git add -- 'ruoyi-ui/src/views/stock/position/index.vue'
git commit -m "style: redesign stock position page"
```

### Task 5: Cross-page responsive and regression verification

**Files:**
- Verify: `ruoyi-ui/src/assets/styles/stock-management.scss`
- Verify: `ruoyi-ui/src/views/stock/analyzer/index.vue`
- Verify: `ruoyi-ui/src/views/stock/watchlist/index.vue`
- Verify: `ruoyi-ui/src/views/stock/position/index.vue`

- [ ] **Step 1: Run the final production build**

Run:

```powershell
npm run build:prod
```

Working directory: `ruoyi-ui`.

Expected: exit code `0` and `Build complete`.

- [ ] **Step 2: Verify no backend or API files changed**

Run:

```powershell
git status --short
git diff --name-only HEAD~3..HEAD
```

Expected for redesign commits: only the shared SCSS and three Vue pages, in addition to the already committed design/plan documentation. Existing user changes to `application.yml` and unrelated untracked files remain untouched.

- [ ] **Step 3: Verify preserved request and permission contracts**

Run:

```powershell
rg -n "stock:(analyzer|watchlist|position):|analyzeStock|addWatchlist|removeWatchlist|addPosition|updatePosition|analyzePosition" 'ruoyi-ui/src/views/stock'
```

Expected: all original operations remain reachable and protected where matching permissions exist.

- [ ] **Step 4: Inspect responsive layouts in the local browser**

Run the existing frontend development command:

```powershell
npm run dev
```

Working directory: `ruoyi-ui`.

Inspect all three pages at desktop, 768px, and 375px widths. Confirm headers stack, metric grids reflow, table actions remain reachable, dialogs fit the viewport, long AI text wraps, and no horizontal overflow appears outside intentionally scrollable tables.

- [ ] **Step 5: Fix only verified presentation defects and rebuild**

For each observed defect, edit the owning page-specific style first; edit shared SCSS only when the defect affects at least two pages. Re-run `npm run build:prod` and expect exit code `0`.

- [ ] **Step 6: Record final status**

Run:

```powershell
git status --short
git log -5 --oneline
```

Expected: no stock UI implementation changes remain unstaged; pre-existing unrelated user changes remain present and unmodified.
