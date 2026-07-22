# 我的持仓 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user holdings and account assets, complete 520 indicators, and explicit three-step AI analysis.

**Architecture:** Persist holdings and account assets through user-scoped MyBatis mappers. Extend `StockAnalysisResult` with calculated 520 indicator fields and append holdings context at the controller/service boundary. Render a row-level report from the same `includeAi` split already used by watchlists.

**Tech Stack:** Java 17, Spring Boot, MyBatis, MySQL, JUnit 5, Vue 2, Element UI.

---

### Task 1: Persist holdings and account assets

**Files:** Create `StockPosition`, `StockAccount`, mapper interfaces/XML, service interfaces/implementations, controller, unit tests; modify `sql/stock_menu.sql`.

- [ ] **Step 1: Write failing service tests for user isolation and calculations.**

```java
assertEquals(new BigDecimal("200.00"), service.marketValue(new BigDecimal("20"), 10));
assertEquals(new BigDecimal("25.00"), service.profitPct(new BigDecimal("20"), new BigDecimal("25")));
assertEquals(new BigDecimal("20.00"), service.positionPct(new BigDecimal("200"), new BigDecimal("1000")));
```

- [ ] **Step 2: Run `mvn -pl ruoyi-system -am -Dtest=StockPositionServiceImplTest test`.** Expected: failure because the position service does not exist.
- [ ] **Step 3: Implement entities, user-scoped mapper methods, CRUD service, and account-asset upsert.** Require positive cost, quantity, and total assets; scope every select/update/delete by `user_id`.
- [ ] **Step 4: Add SQL tables, unique indexes, position menu, and `stock:position:*` permissions.**
- [ ] **Step 5: Re-run the test.** Expected: all position calculation and ownership tests pass.

### Task 2: Calculate and expose the 520 report

**Files:** Modify `StockAnalysisResult`, `StockAnalyzerServiceImpl`, `IStockAnalyzerService`, and add analyzer tests.

- [ ] **Step 1: Write failing tests for volume ratio, contraction ratio, MA positions, 20-day range, MA-convergence days, and default sector trend.**

```java
assertEquals(1.5d, result.getVolumeRatio());
assertEquals("暂未接入", result.getSectorTrend());
```

- [ ] **Step 2: Run the analyzer test.** Expected: failure because the indicator getters are missing.
- [ ] **Step 3: Implement a `Stock520Indicators` value object.** Include prior-day volume/close, volume and contraction ratios, range high/low, MA5/MA20 positions, convergence days, SSE MA20 trend, and sector trend `暂未接入`.
- [ ] **Step 4: Add holdings context fields.** For a position analysis, calculate cost amount, market value, profit amount/pct, account total assets, and holding pct; use `未设置` for unavailable asset-based ratios.
- [ ] **Step 5: Update DeepSeek prompt construction.** Require exactly three sections: trend gate, three entry signals, and exit/stop-loss/take-profit/position discipline. Call it only when `includeAi` is true.
- [ ] **Step 6: Re-run all analyzer tests.** Expected: all non-AI and explicit-AI tests pass.

### Task 3: Build the holdings page and verify

**Files:** Create `ruoyi-ui/src/api/stock/position.js` and `ruoyi-ui/src/views/stock/position/index.vue`; modify `sql/stock_menu.sql`.

- [ ] **Step 1: Add API methods for account asset get/save, holding list/add/edit/delete, technical analysis, and AI analysis.**
- [ ] **Step 2: Implement page forms and table.** Use dialogs for account assets and editing cost/quantity; list all cost, market, profit, and holding-pct values.
- [ ] **Step 3: Implement an inline analysis panel.** Display each 520 CSV indicator, including index trend and `暂未接入` sector trend, then add an AI button that sends `includeAi: true` only on click.
- [ ] **Step 4: Run `mvn -pl ruoyi-admin -am package -DskipTests` and `npm run build:prod` from `ruoyi-ui`.** Expected: both exit 0.
- [ ] **Step 5: Commit.** Stage all positions files and commit `feat: add stock positions`.

## Plan self-review

- Spec coverage: Task 1 covers durable user holdings/assets; Task 2 covers every calculable CSV field and 520 AI structure; Task 3 covers the menu, UI, inline report, and verification.
- Placeholder scan: no deferred implementation work remains.
- Type consistency: `StockPosition`, `StockAccount`, `Stock520Indicators`, `includeAi`, and `positionPct` are used consistently.
