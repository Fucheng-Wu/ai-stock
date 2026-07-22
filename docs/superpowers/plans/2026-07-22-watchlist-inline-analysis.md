# 自选股行内分析 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a selected watchlist stock's non-AI report inline and request DeepSeek only after an explicit AI-analysis action.

**Architecture:** Add an `includeAi` overload to the analyzer service and pass the request flag through the current controller. The watchlist component keeps per-code loading/result state and renders the analysis result in an expandable table row.

**Tech Stack:** Spring Boot, JUnit 5, Vue 2, Element UI.

---

### Task 1: Test and add optional AI analysis

**Files:** Modify `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java`, `ruoyi-system/src/main/java/com/ruoyi/system/service/IStockAnalyzerService.java`, `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java`, and `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockAnalyzerController.java`.

- [ ] **Step 1: Write a failing test that calls `analyze("600519", false)` with a mocked `RestTemplate` and verifies no DeepSeek POST is made.**
- [ ] **Step 2: Run the test.** Run `mvn -pl ruoyi-system -am -Dtest=StockAnalyzerServiceImplTest test`; expected failure because the overload is missing.
- [ ] **Step 3: Add `StockAnalysisResult analyze(String stockCode, boolean includeAi)`.** Keep `analyze(String)` delegating to it with `true`; execute the existing `callDeepSeek` block only when `includeAi` is true. The controller reads `includeAi` with `Boolean.parseBoolean` and defaults it to true.
- [ ] **Step 4: Re-run the test.** Expected: test passes and the false path leaves AI fields empty.

### Task 2: Render inline technical and optional AI reports

**Files:** Modify `ruoyi-ui/src/views/stock/watchlist/index.vue` and `ruoyi-ui/src/api/stock/analyzer.js`.

- [ ] **Step 1: Add `analyzeStock({ stockCode, includeAi: false })` call when a row is opened.** Store results keyed by stock code and track the currently expanded code.
- [ ] **Step 2: Render an Element UI expansion panel below the row.** Display real-time open/previous close/high/low/volume/amount, MA5/MA20, trend, transaction signal, risk level, and the six trading disciplines from the analyzer page.
- [ ] **Step 3: Add an AI button.** Call `analyzeStock({ stockCode, includeAi: true })`, replace the stored result, and append the returned AI advice and reason; do not invoke it from the initial expand request.
- [ ] **Step 4: Run `npm run build:prod` in `ruoyi-ui`.** Expected: exits 0.

### Task 3: Verify and commit

**Files:** All modified files above.

- [ ] **Step 1: Run `mvn -pl ruoyi-admin -am package -DskipTests` and `npm run build:prod` from `ruoyi-ui`.** Expected: both exit 0.
- [ ] **Step 2: Confirm by inspection that the initial watchlist request carries `includeAi: false` and the only `includeAi: true` request is the AI button handler.**
- [ ] **Step 3: Commit.** Stage the service, controller, test, and watchlist UI files; commit `feat: add inline watchlist analysis`.

## Plan self-review

- Spec coverage: Task 1 prevents unrequested DeepSeek calls; Task 2 supplies all non-AI report content inline plus explicit AI display; Task 3 verifies both builds.
- Placeholder scan: no deferred implementation work remains.
- Type consistency: `includeAi` is used by the service, controller, and frontend request body.
