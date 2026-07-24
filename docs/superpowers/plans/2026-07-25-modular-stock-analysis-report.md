# Modular Stock Analysis Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-signal stock report with a versioned six-module report that computes every deterministic rule from completed daily bars and obtains all applicable AI explanations in one DeepSeek request.

**Architecture:** Introduce typed report sections, typed daily bars, a completed-bar/MA preparation layer, a pure 520 rule engine, and a DeepSeek adapter that can only fill AI text. Keep `StockAnalyzerServiceImpl` as the orchestrator, pass holding context into it before AI execution, and render the same response through one shared Vue report component in the analyzer, watchlist, and position pages.

**Tech Stack:** Java 17, Spring Boot, Fastjson2, JUnit 5, Vue 2.6, Element UI 2.15, SCSS, Node contract tests, Maven, Vue CLI

---

## File map

### Backend domain and analysis units

- Create `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/AnalysisScene.java`: trusted analysis scene enum.
- Create `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/DailyBar.java`: normalized daily OHLCV value object.
- Create `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/AnalysisContext.java`: scene and optional holding inputs.
- Rewrite `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisResult.java`: versioned module report and nested section/evidence/mistake DTOs.
- Modify `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockRealtimeData.java`: add the source-provided standard volume ratio.
- Create `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/CompletedBarSelector.java`: exclude an unfinished current-day bar using an injected `Clock`.
- Create `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/MovingAverageCalculator.java`: calculate unrounded MA series.
- Create `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/StockMarketDataClient.java`: Tencent/Sina access and response normalization.
- Create `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/Stock520RuleEngine.java`: trend, buy-point, stop-loss, and take-profit evidence.
- Create `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/DeepSeekStockAdvisor.java`: one structured AI request and field-level fallback.
- Rewrite `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java`: orchestration only.
- Modify `ruoyi-system/src/main/java/com/ruoyi/system/service/IStockAnalyzerService.java`: remove `includeAi`, add scene and position entry points.

### Backend controllers and snapshots

- Modify `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockAnalyzerController.java`: accept only `ANALYZER`/`WATCHLIST`, always request AI.
- Rewrite the analysis method in `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java`: pass trusted holding context before AI and save the resulting report.
- Modify `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockPositionAnalysisSnapshotServiceImpl.java`: tolerate corrupt JSON and expose schema compatibility.

### Backend tests

- Rewrite `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java`.
- Create `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/MarketDataPreparationTest.java`.
- Create `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/Stock520RuleEngineTest.java`.
- Create `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/DeepSeekStockAdvisorTest.java`.
- Modify `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockPositionAnalysisSnapshotServiceImplTest.java`.

### Frontend

- Create `ruoyi-ui/src/components/StockAnalysisReport/index.vue`: shared six-module renderer.
- Create `ruoyi-ui/src/components/StockAnalysisReport/SectionCard.vue`: evidence and AI panel for one section.
- Create `ruoyi-ui/tests/modular-stock-analysis-report.test.js`: source-level regression contract.
- Modify `ruoyi-ui/package.json`: add the modular report test script.
- Modify `ruoyi-ui/src/api/stock/position.js`: remove `includeAi` from position analysis payload.
- Modify `ruoyi-ui/src/views/stock/analyzer/index.vue`: use the shared report.
- Modify `ruoyi-ui/src/views/stock/watchlist/index.vue`: explicit analysis only; no AI-on-expand.
- Modify `ruoyi-ui/src/views/stock/position/index.vue`: version-gated saved report and one analysis action.
- Modify `ruoyi-ui/src/assets/styles/stock-management.scss`: shared module, evidence, and status layout.
- Modify `ruoyi-ui/tests/stock-analysis-expand-toggle.test.js`: assert the new explicit-analysis contract.

## Task 1: Define the versioned report contract

**Files:**
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/AnalysisScene.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/AnalysisContext.java`
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisResult.java`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java`

- [ ] **Step 1: Replace the old service test with a failing report-contract test**

```java
@Test
void exposesVersionedConditionalModules() {
    StockAnalysisResult result = new StockAnalysisResult();
    result.setSchemaVersion(StockAnalysisResult.CURRENT_SCHEMA_VERSION);
    result.setScene(AnalysisScene.POSITION.name());
    result.setBasicInfo(section("BASIC_INFO"));
    result.setTrend(section("TREND"));
    result.setBuyPoints(List.of(section("GOLDEN_CROSS")));
    result.setStopLoss(List.of(section("SHORT_TERM"), section("TREND")));
    result.setTakeProfit(List.of(section("REGULAR"), section("STRONG")));

    assertEquals("2.0", result.getSchemaVersion());
    assertEquals("POSITION", result.getScene());
    assertEquals("GOLDEN_CROSS", result.getBuyPoints().get(0).getCode());
    assertEquals(2, result.getStopLoss().size());
    assertEquals(2, result.getTakeProfit().size());
}

private StockAnalysisResult.Section section(String code) {
    StockAnalysisResult.Section section = new StockAnalysisResult.Section();
    section.setCode(code);
    return section;
}
```

- [ ] **Step 2: Run the test and verify the new contract is missing**

Run:

```powershell
mvn -pl ruoyi-system -Dtest=StockAnalyzerServiceImplTest test
```

Expected: compilation fails because `CURRENT_SCHEMA_VERSION`, `AnalysisScene`, `Section`, and module accessors do not exist.

- [ ] **Step 3: Add the scene/context types and versioned DTO**

Implement these exact public contracts:

```java
public enum AnalysisScene { ANALYZER, WATCHLIST, POSITION }
```

```java
public final class AnalysisContext {
    private final AnalysisScene scene;
    private final BigDecimal costPrice;
    private final Long quantity;
    private final BigDecimal totalAssets;

    private AnalysisContext(AnalysisScene scene, BigDecimal costPrice, Long quantity, BigDecimal totalAssets) {
        this.scene = scene;
        this.costPrice = costPrice;
        this.quantity = quantity;
        this.totalAssets = totalAssets;
    }

    public static AnalysisContext forScene(AnalysisScene scene) {
        if (scene == AnalysisScene.POSITION) throw new IllegalArgumentException("持仓分析必须提供持仓信息");
        return new AnalysisContext(scene, null, null, null);
    }

    public static AnalysisContext forPosition(BigDecimal costPrice, Long quantity, BigDecimal totalAssets) {
        if (costPrice == null || costPrice.signum() <= 0 || quantity == null || quantity <= 0) {
            throw new IllegalArgumentException("持仓成本和数量必须大于零");
        }
        return new AnalysisContext(AnalysisScene.POSITION, costPrice, quantity, totalAssets);
    }

    public AnalysisScene getScene() { return scene; }
    public BigDecimal getCostPrice() { return costPrice; }
    public Long getQuantity() { return quantity; }
    public BigDecimal getTotalAssets() { return totalAssets; }
}
```

Rewrite `StockAnalysisResult` as the following no-argument Fastjson-compatible DTO (imports omitted here are `java.util.ArrayList`, `java.util.LinkedHashMap`, `java.util.List`, and `java.util.Map`):

```java
public class StockAnalysisResult {
    public static final String CURRENT_SCHEMA_VERSION = "2.0";
    private String schemaVersion = CURRENT_SCHEMA_VERSION;
    private String snapshotStatus = "CURRENT";
    private String scene;
    private String stockCode;
    private String stockName;
    private String analyzedAt;
    private String realtimeQuoteTime;
    private String completedBarDate;
    private StockRealtimeData stock;
    private Section basicInfo;
    private Section trend;
    private List<Section> buyPoints = new ArrayList<>();
    private List<Section> stopLoss = new ArrayList<>();
    private List<Section> takeProfit = new ArrayList<>();
    private List<Mistake> forbiddenMistakes = new ArrayList<>();
    private Map<String, Object> holding = new LinkedHashMap<>();
    private PositionDecision positionDecision;

    public String getSchemaVersion() { return schemaVersion; }
    public void setSchemaVersion(String value) { schemaVersion = value; }
    public String getSnapshotStatus() { return snapshotStatus; }
    public void setSnapshotStatus(String value) { snapshotStatus = value; }
    public String getScene() { return scene; }
    public void setScene(String value) { scene = value; }
    public String getStockCode() { return stockCode; }
    public void setStockCode(String value) { stockCode = value; }
    public String getStockName() { return stockName; }
    public void setStockName(String value) { stockName = value; }
    public String getAnalyzedAt() { return analyzedAt; }
    public void setAnalyzedAt(String value) { analyzedAt = value; }
    public String getRealtimeQuoteTime() { return realtimeQuoteTime; }
    public void setRealtimeQuoteTime(String value) { realtimeQuoteTime = value; }
    public String getCompletedBarDate() { return completedBarDate; }
    public void setCompletedBarDate(String value) { completedBarDate = value; }
    public StockRealtimeData getStock() { return stock; }
    public void setStock(StockRealtimeData value) { stock = value; }
    public Section getBasicInfo() { return basicInfo; }
    public void setBasicInfo(Section value) { basicInfo = value; }
    public Section getTrend() { return trend; }
    public void setTrend(Section value) { trend = value; }
    public List<Section> getBuyPoints() { return buyPoints; }
    public void setBuyPoints(List<Section> value) { buyPoints = value == null ? new ArrayList<>() : value; }
    public List<Section> getStopLoss() { return stopLoss; }
    public void setStopLoss(List<Section> value) { stopLoss = value == null ? new ArrayList<>() : value; }
    public List<Section> getTakeProfit() { return takeProfit; }
    public void setTakeProfit(List<Section> value) { takeProfit = value == null ? new ArrayList<>() : value; }
    public List<Mistake> getForbiddenMistakes() { return forbiddenMistakes; }
    public void setForbiddenMistakes(List<Mistake> value) { forbiddenMistakes = value == null ? new ArrayList<>() : value; }
    public Map<String, Object> getHolding() { return holding; }
    public void setHolding(Map<String, Object> value) { holding = value == null ? new LinkedHashMap<>() : value; }
    public PositionDecision getPositionDecision() { return positionDecision; }
    public void setPositionDecision(PositionDecision value) { positionDecision = value; }

    public static class Section {
        private String code;
        private String title;
        private String status;
        private String conclusion;
        private List<Evidence> evidence = new ArrayList<>();
        private String aiAnalysis;
        private String aiStatus;
        public String getCode() { return code; }
        public void setCode(String value) { code = value; }
        public String getTitle() { return title; }
        public void setTitle(String value) { title = value; }
        public String getStatus() { return status; }
        public void setStatus(String value) { status = value; }
        public String getConclusion() { return conclusion; }
        public void setConclusion(String value) { conclusion = value; }
        public List<Evidence> getEvidence() { return evidence; }
        public void setEvidence(List<Evidence> value) { evidence = value == null ? new ArrayList<>() : value; }
        public String getAiAnalysis() { return aiAnalysis; }
        public void setAiAnalysis(String value) { aiAnalysis = value; }
        public String getAiStatus() { return aiStatus; }
        public void setAiStatus(String value) { aiStatus = value; }
    }

    public static class Evidence {
        private String key;
        private String label;
        private Object actualValue;
        private String unit;
        private String threshold;
        private Boolean passed;
        private String explanation;
        public String getKey() { return key; }
        public void setKey(String value) { key = value; }
        public String getLabel() { return label; }
        public void setLabel(String value) { label = value; }
        public Object getActualValue() { return actualValue; }
        public void setActualValue(Object value) { actualValue = value; }
        public String getUnit() { return unit; }
        public void setUnit(String value) { unit = value; }
        public String getThreshold() { return threshold; }
        public void setThreshold(String value) { threshold = value; }
        public Boolean getPassed() { return passed; }
        public void setPassed(Boolean value) { passed = value; }
        public String getExplanation() { return explanation; }
        public void setExplanation(String value) { explanation = value; }
    }

    public static class Mistake {
        private int number;
        private String title;
        private String consequence;
        public int getNumber() { return number; }
        public void setNumber(int value) { number = value; }
        public String getTitle() { return title; }
        public void setTitle(String value) { title = value; }
        public String getConsequence() { return consequence; }
        public void setConsequence(String value) { consequence = value; }
    }

    public static class PositionDecision {
        private String action;
        private String triggeredBy;
        private String conclusion;
        public String getAction() { return action; }
        public void setAction(String value) { action = value; }
        public String getTriggeredBy() { return triggeredBy; }
        public void setTriggeredBy(String value) { triggeredBy = value; }
        public String getConclusion() { return conclusion; }
        public void setConclusion(String value) { conclusion = value; }
    }
}
```

- [ ] **Step 4: Run the contract test**

Run: `mvn -pl ruoyi-system -Dtest=StockAnalyzerServiceImplTest test`

Expected: `Tests run: 1, Failures: 0, Errors: 0`.

- [ ] **Step 5: Commit the report contract**

```powershell
git add -- ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/AnalysisScene.java ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/AnalysisContext.java ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisResult.java ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java
git commit -m "refactor: define modular stock analysis report"
```

## Task 2: Normalize market data and completed-bar calculations

**Files:**
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/DailyBar.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/CompletedBarSelector.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/MovingAverageCalculator.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/StockMarketDataClient.java`
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockRealtimeData.java`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/MarketDataPreparationTest.java`

- [ ] **Step 1: Write failing tests for bar completion, three MAs, Tencent volume ratio, and independent day-volume ratio**

```java
@Test
void excludesTodayBefore1510AndIncludesItAfter1510() {
    List<DailyBar> bars = List.of(bar("2026-07-23", 10, 100), bar("2026-07-24", 11, 120));
    Clock beforeClose = Clock.fixed(Instant.parse("2026-07-24T06:00:00Z"), ZoneId.of("Asia/Shanghai"));
    Clock afterClose = Clock.fixed(Instant.parse("2026-07-24T07:11:00Z"), ZoneId.of("Asia/Shanghai"));
    assertEquals(1, new CompletedBarSelector(beforeClose).select(bars).size());
    assertEquals(2, new CompletedBarSelector(afterClose).select(bars).size());
}

@Test
void calculatesMa5Ma10Ma20WithoutIntermediateRounding() {
    List<DailyBar> bars = IntStream.rangeClosed(1, 20)
        .mapToObj(i -> bar(String.format("2026-06-%02d", i), i, 100 + i))
        .toList();
    MovingAverageCalculator ma = new MovingAverageCalculator(bars);
    assertEquals(new BigDecimal("18.00000000"), ma.valueAt(19, 5));
    assertEquals(new BigDecimal("15.50000000"), ma.valueAt(19, 10));
    assertEquals(new BigDecimal("10.50000000"), ma.valueAt(19, 20));
}

@Test
void parsesSourceVolumeRatioWithoutReplacingItWithDayVolumeRatio() {
    StockRealtimeData quote = StockMarketDataClient.parseTencentResponse("sh600519", tencentPayload("1.37"));
    assertEquals(1.37d, quote.getVolumeRatio(), 0.0001d);
    assertEquals(new BigDecimal("1.20000000"), StockMarketDataClient.dayVolumeRatio(
        bar("2026-07-24", 10, 120), bar("2026-07-23", 10, 100)));
}
```

The helper `tencentPayload` must create at least 50 fields and set field `49` to the standard volume ratio. `dayVolumeRatio` must use two normalized `DailyBar` volumes, never `StockRealtimeData.volume` divided by a Sina value.

- [ ] **Step 2: Run the preparation test and verify failure**

Run: `mvn -pl ruoyi-system -Dtest=MarketDataPreparationTest test`

Expected: compilation fails because the new preparation types do not exist.

- [ ] **Step 3: Implement typed market preparation**

`DailyBar` must hold `LocalDate date` and `BigDecimal open/high/low/close/volume`, validate non-null positive prices and non-negative volume, and expose getters.

`CompletedBarSelector.select` must sort ascending, deduplicate by date using the last value for a duplicate date, and exclude `LocalDate.now(clock)` when local time is before `15:10`.

`MovingAverageCalculator.valueAt(index, period)` must return `null` for insufficient history and otherwise divide with scale `8` and `RoundingMode.HALF_UP`; do not round to two decimals inside the engine.

Move Tencent/Sina HTTP and parsing from `StockAnalyzerServiceImpl` into `StockMarketDataClient`. Keep GBK decoding, parse Tencent field `49` when present, and expose:

```java
public StockRealtimeData fetchRealtime(String normalizedCode)
public List<DailyBar> fetchDailyBars(String normalizedCode)
static StockRealtimeData parseTencentResponse(String code, String text)
static BigDecimal dayVolumeRatio(DailyBar current, DailyBar previous)
```

Return `null` for day-volume ratio when either bar is missing or previous volume is zero.

- [ ] **Step 4: Run market preparation tests**

Run: `mvn -pl ruoyi-system -Dtest=MarketDataPreparationTest test`

Expected: all completion, MA, standard ratio, and day-volume ratio tests pass.

- [ ] **Step 5: Commit market preparation**

```powershell
git add -- ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/DailyBar.java ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockRealtimeData.java ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/CompletedBarSelector.java ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/MovingAverageCalculator.java ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/StockMarketDataClient.java ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/MarketDataPreparationTest.java
git commit -m "refactor: normalize completed stock market data"
```

## Task 3: Implement trend and all three buy-point reports

**Files:**
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/Stock520RuleEngine.java`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/Stock520RuleEngineTest.java`

- [ ] **Step 1: Write failing trend-boundary and buy-point tests**

Create deterministic fixtures and these tests:

```java
@Test void trendIsUpOnlyAbovePositiveBoundary() {
    assertEquals("UP", engine.trend(barsWithMa20Change("0.151")).getStatus());
    assertEquals("FLAT", engine.trend(barsWithMa20Change("0.150")).getStatus());
}

@Test void trendIsDownOnlyBelowNegativeBoundary() {
    assertEquals("DOWN", engine.trend(barsWithMa20Change("-0.151")).getStatus());
    assertEquals("FLAT", engine.trend(barsWithMa20Change("-0.150")).getStatus());
}

@Test void reportsEveryBuyPointWhenTrendIsUp() {
    List<StockAnalysisResult.Section> sections = engine.buyPoints(validUptrendFixture());
    assertEquals(List.of("GOLDEN_CROSS", "RETRACE", "CONVERGENCE_BREAKOUT"),
        sections.stream().map(StockAnalysisResult.Section::getCode).toList());
    assertTrue(sections.stream().allMatch(section -> !section.getEvidence().isEmpty()));
}

@Test void goldenCrossFailsWhenVolumeIsBelowOnePointFiveTimesAverage() {
    StockAnalysisResult.Section golden = section(engine.buyPoints(goldenFixture(new BigDecimal("1.49"))), "GOLDEN_CROSS");
    assertEquals("NOT_MATCHED", golden.getStatus());
    assertFalse(evidence(golden, "volumeMultiple").getPassed());
}

@Test void retraceWaitsForConfirmationCandle() {
    StockAnalysisResult.Section retrace = section(engine.buyPoints(retraceFixtureWithoutConfirmation()), "RETRACE");
    assertEquals("PENDING", retrace.getStatus());
}

@Test void convergenceRequiresFiveDaysAndRangeBreakout() {
    StockAnalysisResult.Section convergence = section(engine.buyPoints(convergenceFixture()), "CONVERGENCE_BREAKOUT");
    assertEquals("MATCHED", convergence.getStatus());
    assertTrue(evidence(convergence, "rangeBreakout").getPassed());
}
```

Fixture builders must produce at least 45 ascending `DailyBar` values so all 20-day lookbacks and MA20 values are real, not mocked section results.

- [ ] **Step 2: Run the rule-engine tests and verify failure**

Run: `mvn -pl ruoyi-system -Dtest=Stock520RuleEngineTest test`

Expected: compilation fails because `Stock520RuleEngine` is missing.

- [ ] **Step 3: Implement deterministic trend and buy rules**

Use constants in one class:

```java
static final BigDecimal TREND_DEAD_ZONE_PCT = new BigDecimal("0.15");
static final BigDecimal VOLUME_CONFIRM_MULTIPLE = new BigDecimal("1.5");
static final BigDecimal CONVERGENCE_DISTANCE_PCT = new BigDecimal("1.0");
static final int CONVERGENCE_DAYS = 5;
static final int RETRACE_LOOKBACK_DAYS = 20;
static final BigDecimal RETRACE_RISE_PCT = new BigDecimal("3.0");
static final BigDecimal RETRACE_MA20_DISTANCE_PCT = new BigDecimal("2.0");
```

Expose:

```java
public StockAnalysisResult.Section basicInfo(StockRealtimeData quote, List<DailyBar> rawBars, List<DailyBar> completedBars)
public StockAnalysisResult.Section trend(List<DailyBar> completedBars)
public List<StockAnalysisResult.Section> buyPoints(List<DailyBar> completedBars)
```

`basicInfo` emits evidence keys `currentPrice`, `ma5`, `ma10`, `ma20`, `marketVolumeRatio`, `dayVolumeRatio`, `realtimeQuoteTime`, and `completedBarDate`. `trend` emits `currentMa20`, `ma20ThreeTradingDaysAgo`, `changeAmount`, `changePct`, and `deadZone`, with equality at either `0.15%` boundary classified as `FLAT`.

`buyPoints` must always return all three sections when called. The golden-cross section evaluates trend `UP`, prior `MA5 <= MA20`, current `MA5 > MA20`, both averages rising, close above both averages, and volume at least 1.5 times the prior five-day average. The retrace section evaluates a valid golden cross in 20 completed days, a post-cross rise of at least 3%, distance to MA20 no more than 2%, same/next-day recovery after any close below MA20, 50%-70% contraction against the preceding five-day average, and a bullish confirmation candle with higher volume and close above MA5. The convergence section evaluates five prior days at no more than 1% MA distance, upward crossing with both averages rising, trend `UP`, 1.5-times volume, and close above the prior 20-day range high.

Set every evidence item even when its condition fails. Return `INSUFFICIENT_DATA` instead of throwing when a lookback cannot be calculated; use `PENDING` for a retrace awaiting recovery or confirmation. Do not call `buyPoints` from the orchestrator unless trend status is `UP`.

- [ ] **Step 4: Run the complete rule test class**

Run: `mvn -pl ruoyi-system -Dtest=Stock520RuleEngineTest test`

Expected: the four trend boundary cases and the golden/retrace/convergence cases pass.

- [ ] **Step 5: Commit trend and buy points**

```powershell
git add -- ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/Stock520RuleEngine.java ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/Stock520RuleEngineTest.java
git commit -m "feat: calculate trend and all buy point evidence"
```

## Task 4: Add position holding, stop-loss, and take-profit rules

**Files:**
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/Stock520RuleEngine.java`
- Modify: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/Stock520RuleEngineTest.java`

- [ ] **Step 1: Add failing position-rule tests**

```java
@Test void shortTermStopMatchesAtMinusFivePercent() {
    AnalysisContext context = AnalysisContext.forPosition(new BigDecimal("10.00"), 100L, new BigDecimal("5000"));
    StockAnalysisResult.Section shortStop = section(engine.stopLoss(positionFixture("9.50"), context), "SHORT_TERM");
    assertEquals("MATCHED", shortStop.getStatus());
    assertEquals(new BigDecimal("-5.00"), evidence(shortStop, "profitPct").getActualValue());
}

@Test void trendStopRequiresBothMa20BreakAndOnePointFiveVolume() {
    StockAnalysisResult.Section trendStop = section(engine.stopLoss(trendBreakFixture("1.49"), positionContext()), "TREND");
    assertEquals("NOT_MATCHED", trendStop.getStatus());
    assertFalse(evidence(trendStop, "volumeMultiple").getPassed());
}

@Test void regularProfitDoesNotOverrideStrongContinuation() {
    List<StockAnalysisResult.Section> takeProfit = engine.takeProfit(strongProfitFixture("5.00"), positionContext());
    assertEquals("NOT_MATCHED", section(takeProfit, "REGULAR").getStatus());
    assertEquals("MATCHED", section(takeProfit, "STRONG").getStatus());
}

@Test void holdingPriorityPutsTrendStopBeforeEveryProfitRule() {
    StockAnalysisResult.PositionDecision decision = engine.positionDecision(profitableTrendBreakFixture(), positionContext());
    assertEquals("CLEAR", decision.getAction());
    assertEquals("TREND_STOP", decision.getTriggeredBy());
}
```

Use the `PositionDecision` root field introduced in Task 1.

- [ ] **Step 2: Run tests and confirm failure**

Run: `mvn -pl ruoyi-system -Dtest=Stock520RuleEngineTest test`

Expected: compilation fails on missing `stopLoss`, `takeProfit`, and `positionDecision`.

- [ ] **Step 3: Implement holding calculations and rule priority**

Expose:

```java
public Map<String, Object> holding(StockRealtimeData quote, List<DailyBar> completedBars, AnalysisContext context)
public List<StockAnalysisResult.Section> stopLoss(List<DailyBar> bars, AnalysisContext context)
public List<StockAnalysisResult.Section> takeProfit(List<DailyBar> bars, AnalysisContext context)
public StockAnalysisResult.PositionDecision positionDecision(List<DailyBar> bars, AnalysisContext context)
```

Use the latest completed close, not the intraday current price, for deterministic profit rules. Include the realtime market value separately in `holding`. Apply priority exactly: trend stop, short stop, regular take-profit, strong hold, ordinary hold/watch. Guard division by zero and missing total assets.

Use these thresholds and conditions without additional heuristics:

- short stop matches at profit percentage `<= -5%` or two consecutive closes below their own MA5 values;
- trend stop matches only when close is below MA20 and volume is at least 1.5 times the preceding five-day average;
- regular take-profit matches at profit `>= 3%` only when strong continuation is false;
- strong continuation requires the last two completed bars to be bullish, each at least 1.2 times its preceding five-day average, MA5 above MA20, and MA distance expanding;
- death cross is prior `MA5 >= MA20` and current `MA5 < MA20`.

- [ ] **Step 4: Run all rule-engine tests**

Run: `mvn -pl ruoyi-system -Dtest=Stock520RuleEngineTest test`

Expected: all trend, buy, stop, take-profit, and priority tests pass.

- [ ] **Step 5: Commit position rules**

```powershell
git add -- ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisResult.java ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/Stock520RuleEngine.java ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/Stock520RuleEngineTest.java
git commit -m "feat: add position stop and take profit evidence"
```

## Task 5: Make one structured DeepSeek request with safe degradation

**Files:**
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/DeepSeekStockAdvisor.java`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/DeepSeekStockAdvisorTest.java`

- [ ] **Step 1: Write failing single-call and partial-response tests**

```java
@Test void callsDeepSeekOnceAndMapsEveryReturnedSection() {
    RecordingRestTemplate rest = new RecordingRestTemplate(aiResponse(fullStructuredJson()));
    DeepSeekStockAdvisor advisor = new DeepSeekStockAdvisor(rest, "key", "https://example.test/chat");
    StockAnalysisResult report = fullPositionReport();

    advisor.enrich(report);

    assertEquals(1, rest.postCount);
    assertEquals("趋势解释", report.getTrend().getAiAnalysis());
    assertEquals("金叉解释", section(report.getBuyPoints(), "GOLDEN_CROSS").getAiAnalysis());
    assertEquals("趋势止损解释", section(report.getStopLoss(), "TREND").getAiAnalysis());
}

@Test void missingOneJsonFieldOnlyDegradesThatSection() {
    DeepSeekStockAdvisor advisor = advisorReturning("{\"basicInfo\":\"基础解释\",\"trend\":\"趋势解释\"}");
    StockAnalysisResult report = fullPositionReport();
    advisor.enrich(report);
    assertEquals("AVAILABLE", report.getTrend().getAiStatus());
    assertEquals("UNAVAILABLE", section(report.getBuyPoints(), "GOLDEN_CROSS").getAiStatus());
}

@Test void apiFailureLeavesDeterministicEvidenceUntouched() {
    DeepSeekStockAdvisor advisor = advisorThrowing(new RuntimeException("timeout"));
    StockAnalysisResult report = fullPositionReport();
    String original = report.getTrend().getConclusion();
    advisor.enrich(report);
    assertEquals(original, report.getTrend().getConclusion());
    assertEquals("UNAVAILABLE", report.getTrend().getAiStatus());
}
```

- [ ] **Step 2: Run the advisor test and verify failure**

Run: `mvn -pl ruoyi-system -Dtest=DeepSeekStockAdvisorTest test`

Expected: compilation fails because `DeepSeekStockAdvisor` does not exist.

- [ ] **Step 3: Implement prompt construction, one HTTP call, and strict mapping**

The adapter constructor is:

```java
public DeepSeekStockAdvisor(RestTemplate restTemplate,
    @Value("${deepseek.api-key:}") String apiKey,
    @Value("${deepseek.base-url:https://api.deepseek.com/v1/chat/completions}") String baseUrl)
```

`enrich(StockAnalysisResult report)` must:

1. mark every applicable section `UNAVAILABLE` before the call;
2. return without HTTP when the key is blank, retaining reason `未配置 DeepSeek API Key`;
3. serialize only stock identity, timestamps, section status/conclusion/evidence, and holding values;
4. request JSON with keys `basicInfo`, `trend`, `buyPoints`, `stopLoss`, and `takeProfit` as applicable;
5. perform exactly one `postForEntity` call;
6. strip optional Markdown fences, parse the JSON object, and map only known section codes;
7. truncate each AI text at 2,000 characters;
8. never assign status, conclusion, evidence, scene, or holding values from AI JSON.

Catch transport and parse exceptions inside `enrich`; log only the exception class and a short sanitized message.

- [ ] **Step 4: Run the advisor tests**

Run: `mvn -pl ruoyi-system -Dtest=DeepSeekStockAdvisorTest test`

Expected: one-call, partial-field, and failure-degradation tests pass.

- [ ] **Step 5: Commit the AI adapter**

```powershell
git add -- ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/DeepSeekStockAdvisor.java ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/DeepSeekStockAdvisorTest.java
git commit -m "feat: add structured single-call stock AI analysis"
```

## Task 6: Rebuild the analyzer orchestrator and controller entry points

**Files:**
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/service/IStockAnalyzerService.java`
- Rewrite: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java`
- Modify: `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockAnalyzerController.java`
- Modify: `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java`
- Rewrite: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java`

- [ ] **Step 1: Add failing orchestration tests for module selection and one AI enrichment**

```java
@Test void analyzerAlwaysReturnsBaseTrendAndMistakesButNoPositionModules() {
    StockAnalyzerServiceImpl service = serviceWith(uptrendData());
    StockAnalysisResult report = service.analyze("600519", AnalysisScene.ANALYZER);
    assertNotNull(report.getBasicInfo());
    assertNotNull(report.getTrend());
    assertEquals(3, report.getBuyPoints().size());
    assertTrue(report.getStopLoss().isEmpty());
    assertTrue(report.getTakeProfit().isEmpty());
    assertEquals(6, report.getForbiddenMistakes().size());
    assertEquals(1, fakeAdvisor.enrichCalls);
}

@Test void flatTrendOmitsBuyPoints() {
    StockAnalysisResult report = serviceWith(flatData()).analyze("600519", AnalysisScene.WATCHLIST);
    assertTrue(report.getBuyPoints().isEmpty());
}

@Test void positionAddsHoldingStopsAndProfitsBeforeAi() {
    StockAnalysisResult report = serviceWith(uptrendData()).analyzePosition(
        "600519", new BigDecimal("10"), 100L, new BigDecimal("10000"));
    assertEquals("POSITION", report.getScene());
    assertEquals(2, report.getStopLoss().size());
    assertEquals(2, report.getTakeProfit().size());
    assertNotNull(fakeAdvisor.reportSeen.getHolding().get("profitPct"));
}
```

Use fake market and AI collaborators; do not access the network.

- [ ] **Step 2: Run the orchestrator test and verify failure**

Run: `mvn -pl ruoyi-system -Dtest=StockAnalyzerServiceImplTest test`

Expected: compilation fails because the interface and service still expose the old `includeAi` signature.

- [ ] **Step 3: Implement the new service API and orchestration order**

Use this interface:

```java
StockAnalysisResult analyze(String stockCode, AnalysisScene scene);
StockAnalysisResult analyzePosition(String stockCode, BigDecimal costPrice, Long quantity, BigDecimal totalAssets);
String resolveStockName(String stockCode);
```

Use constructor injection so tests can pass deterministic collaborators:

```java
public StockAnalyzerServiceImpl(StockMarketDataClient marketDataClient,
    CompletedBarSelector completedBarSelector,
    Stock520RuleEngine ruleEngine,
    DeepSeekStockAdvisor advisor) {
    this.marketDataClient = marketDataClient;
    this.completedBarSelector = completedBarSelector;
    this.ruleEngine = ruleEngine;
    this.advisor = advisor;
}
```

The service must normalize the code, fetch realtime and raw daily data, select completed bars, populate base/trend, add three buy-point sections only for `UP`, add position sections only for `POSITION`, append the six exact mistakes as Java constants, then call `advisor.enrich(report)` once. Build the constants with the full source wording:

```java
private static final List<String[]> FORBIDDEN_MISTAKES = List.of(
    new String[]{"只看金叉，不看20日线趋势", "20日线向下的金叉，全是诱多陷阱，直接忽略。"},
    new String[]{"无量金叉就进场", "没有成交量配合，是假信号，肯定涨不起来。"},
    new String[]{"回踩时放量下跌", "放量回踩是主力出货，不是洗盘，赶紧离场。"},
    new String[]{"震荡市频繁操作", "20日线走平，信号无效，频繁买卖只亏手续费。"},
    new String[]{"不止损，心存幻想", "小亏变大亏，最后深套割肉，30万本金经不起折腾。"},
    new String[]{"盈利后贪心不止盈", "赚了想赚更多，利润回吐，竹篮打水一场空。"}
);
```

When one market source fails, construct the partial report described in the spec. Throw a stable `ServiceException("行情数据暂不可用，请稍后重试")` only when both sources fail.

In `StockAnalyzerController`, default scene to `ANALYZER`; accept `WATCHLIST` only when the request value exactly matches it. Ignore/reject `POSITION` so clients cannot inject holding mode.

In `StockPositionController`, replace the compressed analysis method with:

```java
@PostMapping("/{id}/analyze")
public AjaxResult analyze(@PathVariable Long id) {
    Long userId = getUserId();
    StockPosition position = service.get(userId, id);
    StockAccount account = service.account(userId);
    StockAnalysisResult report = analyzer.analyzePosition(
        position.getStockCode(), position.getCostPrice(), position.getQuantity(),
        account == null ? null : account.getTotalAssets());
    snapshots.save(userId, id, report);
    return success(report);
}
```

- [ ] **Step 4: Run system tests and compile the admin module**

Run:

```powershell
mvn -pl ruoyi-system test
mvn -pl ruoyi-admin -am -DskipTests package
```

Expected: all `ruoyi-system` tests pass and the admin reactor build ends with `BUILD SUCCESS`.

- [ ] **Step 5: Commit orchestration and controllers**

```powershell
git add -- ruoyi-system/src/main/java/com/ruoyi/system/service/IStockAnalyzerService.java ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockAnalyzerController.java ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java
git commit -m "refactor: orchestrate modular stock analysis"
```

## Task 7: Version-gate saved position reports

**Files:**
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockPositionAnalysisSnapshotServiceImpl.java`
- Modify: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockPositionAnalysisSnapshotServiceImplTest.java`

- [ ] **Step 1: Replace the legacy AI-advice snapshot assertion with failing version tests**

```java
@Test void returnsCurrentVersionSnapshot() {
    MemoryMapper mapper = new MemoryMapper();
    StockPositionAnalysisSnapshotServiceImpl service = new StockPositionAnalysisSnapshotServiceImpl(mapper);
    StockAnalysisResult report = new StockAnalysisResult();
    report.setSchemaVersion(StockAnalysisResult.CURRENT_SCHEMA_VERSION);
    service.save(1L, 10L, report);
    assertEquals("2.0", service.get(1L, 10L).getSchemaVersion());
}

@Test void marksLegacySnapshotWithoutTryingToRenderNewModules() {
    MemoryMapper mapper = new MemoryMapper();
    mapper.putRaw(1L, 10L, "{\"aiAdvice\":\"legacy\"}");
    StockAnalysisResult report = new StockPositionAnalysisSnapshotServiceImpl(mapper).get(1L, 10L);
    assertEquals("LEGACY", report.getSnapshotStatus());
}

@Test void corruptSnapshotReturnsNullInsteadOfBreakingPositionList() {
    MemoryMapper mapper = new MemoryMapper();
    mapper.putRaw(1L, 10L, "not-json");
    assertNull(new StockPositionAnalysisSnapshotServiceImpl(mapper).get(1L, 10L));
}
```

Use the root `snapshotStatus` field introduced in Task 1; new reports use `CURRENT`, incompatible reports use `LEGACY`.

- [ ] **Step 2: Run the snapshot test and verify failure**

Run: `mvn -pl ruoyi-system -Dtest=StockPositionAnalysisSnapshotServiceImplTest test`

Expected: new legacy/corrupt assertions fail.

- [ ] **Step 3: Implement safe version handling**

Wrap Fastjson parsing in `try/catch`. Return `null` for corrupt JSON. For parsed reports with a missing or unequal schema version, return a minimal result with `snapshotStatus = "LEGACY"`; do not expose old AI fields as current module analysis. `save` always sets current schema and `snapshotStatus = "CURRENT"` before serialization.

- [ ] **Step 4: Run snapshot and position tests**

Run: `mvn -pl ruoyi-system -Dtest=StockPositionAnalysisSnapshotServiceImplTest,StockPositionServiceImplTest test`

Expected: all snapshot version, corrupt JSON, user scoping, and position removal tests pass.

- [ ] **Step 5: Commit snapshot compatibility**

```powershell
git add -- ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisResult.java ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockPositionAnalysisSnapshotServiceImpl.java ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockPositionAnalysisSnapshotServiceImplTest.java
git commit -m "fix: version gate position analysis snapshots"
```

## Task 8: Build the shared six-module Vue report

**Files:**
- Create: `ruoyi-ui/src/components/StockAnalysisReport/index.vue`
- Create: `ruoyi-ui/src/components/StockAnalysisReport/SectionCard.vue`
- Create: `ruoyi-ui/tests/modular-stock-analysis-report.test.js`
- Modify: `ruoyi-ui/package.json`
- Modify: `ruoyi-ui/src/assets/styles/stock-management.scss`

- [ ] **Step 1: Write a failing source-contract test**

```js
const assert = require('assert')
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const component = read('src/components/StockAnalysisReport/index.vue')
const sectionCard = read('src/components/StockAnalysisReport/SectionCard.vue')
assert(component.includes('01 基础信息'))
assert(component.includes('02 定趋势'))
assert(component.includes('v-if="report.buyPoints && report.buyPoints.length"'))
assert(component.includes('04 止损'))
assert(component.includes('05 止盈'))
assert(component.includes('06 坚决不能犯的错误'))
assert(sectionCard.includes('section.evidence'))
assert(sectionCard.includes('section.aiAnalysis'))
assert(sectionCard.includes('AI 分析暂不可用'))
console.log('modular stock analysis report contracts passed')
```

Add `"test:stock-report": "node tests/modular-stock-analysis-report.test.js"` to `scripts`.

- [ ] **Step 2: Run the contract test and verify failure**

Run from `ruoyi-ui`: `npm run test:stock-report`

Expected: `ENOENT` because the shared component does not exist.

- [ ] **Step 3: Implement the shared renderer**

The component accepts one required `report` prop and uses the following concrete module structure; `renderSections` is implemented by the repeated `v-for` blocks shown here rather than by dynamic HTML:

```vue
<section class="analysis-module analysis-module--basic">
  <h2>01 基础信息</h2>
  <SectionCard :section="report.basicInfo" />
</section>
<section class="analysis-module analysis-module--trend">
  <h2>02 定趋势</h2>
  <SectionCard :section="report.trend" />
</section>
<section v-if="report.buyPoints && report.buyPoints.length" class="analysis-module">
  <h2>03 找买点</h2>
  <div class="analysis-subgrid analysis-subgrid--three">
    <SectionCard v-for="section in report.buyPoints" :key="section.code" :section="section" />
  </div>
</section>
<section v-if="report.stopLoss && report.stopLoss.length" class="analysis-module">
  <h2>04 止损</h2>
  <div class="analysis-subgrid analysis-subgrid--two">
    <SectionCard v-for="section in report.stopLoss" :key="section.code" :section="section" />
  </div>
</section>
<section v-if="report.takeProfit && report.takeProfit.length" class="analysis-module">
  <h2>05 止盈</h2>
  <div class="analysis-subgrid analysis-subgrid--two">
    <SectionCard v-for="section in report.takeProfit" :key="section.code" :section="section" />
  </div>
</section>
<section class="analysis-module analysis-module--mistakes">
  <h2>06 坚决不能犯的错误</h2>
  <div class="mistake-grid">
    <article v-for="item in report.forbiddenMistakes" :key="item.number" class="mistake-card">
      <span>{{ String(item.number).padStart(2, '0') }}</span>
      <strong>{{ item.title }}</strong>
      <p>{{ item.consequence }}</p>
    </article>
  </div>
</section>
```

Wrap that template in `index.vue` and register the card with:

```vue
<script>
import SectionCard from './SectionCard.vue'

export default {
  name: 'StockAnalysisReport',
  components: { SectionCard },
  props: { report: { type: Object, required: true } }
}
</script>
```

Register `SectionCard.vue` locally in `index.vue`. `SectionCard.vue` accepts one required `section` prop and renders every `Evidence` as label, formatted actual value/unit, threshold, pass/fail icon, and explanation. It renders `aiAnalysis` when `aiStatus === 'AVAILABLE'`; otherwise it renders `AI 分析暂不可用` plus the server-provided safe reason. Map `MATCHED`, `NOT_MATCHED`, `PENDING`, and `INSUFFICIENT_DATA` to text and badge classes.

Use this component body:

```vue
<template>
  <article class="analysis-section-card">
    <header class="analysis-section-card__header">
      <h3>{{ section.title }}</h3>
      <span class="stock-badge" :class="statusClass">{{ statusLabel }}</span>
    </header>
    <p class="analysis-section-card__conclusion">{{ section.conclusion || '暂无确定性结论' }}</p>
    <div class="evidence-list">
      <div v-for="item in section.evidence || []" :key="item.key" class="evidence-row">
        <span :class="item.passed === true ? 'evidence-pass' : item.passed === false ? 'evidence-fail' : ''">
          <i :class="item.passed === true ? 'el-icon-success' : item.passed === false ? 'el-icon-error' : 'el-icon-more'" />
          {{ item.label }}
        </span>
        <strong>{{ value(item) }}</strong>
        <small>{{ item.threshold ? `规则：${item.threshold}` : '' }}</small>
        <p>{{ item.explanation }}</p>
      </div>
    </div>
    <div class="analysis-ai-panel">
      <strong>AI 分析</strong>
      <p v-if="section.aiStatus === 'AVAILABLE'">{{ section.aiAnalysis }}</p>
      <p v-else>AI 分析暂不可用{{ section.aiAnalysis ? `：${section.aiAnalysis}` : '' }}</p>
    </div>
  </article>
</template>

<script>
export default {
  name: 'StockAnalysisSectionCard',
  props: { section: { type: Object, required: true } },
  computed: {
    statusLabel() {
      return { MATCHED: '满足', NOT_MATCHED: '不满足', PENDING: '待确认', INSUFFICIENT_DATA: '数据不足', UP: '向上', FLAT: '走平', DOWN: '向下' }[this.section.status] || '未知'
    },
    statusClass() {
      return { MATCHED: 'stock-badge--up', UP: 'stock-badge--up', NOT_MATCHED: 'stock-badge--muted', PENDING: 'stock-badge--warning', INSUFFICIENT_DATA: 'stock-badge--warning', FLAT: 'stock-badge--warning', DOWN: 'stock-badge--down' }[this.section.status] || ''
    }
  },
  methods: {
    value(item) {
      if (item.actualValue === null || item.actualValue === undefined || item.actualValue === '') return '--'
      return `${item.actualValue}${item.unit || ''}`
    }
  }
}
</script>
```

Add shared SCSS for six-column basic metrics, three buy cards, two stop/take cards, evidence rows, AI panels, and two-row mistake cards. Break down to two columns at 768px and one at 480px.

- [ ] **Step 4: Run the contract test and production build**

Run from `ruoyi-ui`:

```powershell
npm run test:stock-report
npm run build:prod
```

Expected: contract message prints and the Vue build exits `0`.

- [ ] **Step 5: Commit the shared report**

```powershell
git add -- ruoyi-ui/src/components/StockAnalysisReport/index.vue ruoyi-ui/src/components/StockAnalysisReport/SectionCard.vue ruoyi-ui/src/assets/styles/stock-management.scss ruoyi-ui/tests/modular-stock-analysis-report.test.js ruoyi-ui/package.json
git commit -m "feat: add shared modular stock analysis report"
```

## Task 9: Integrate analyzer, watchlist, and position pages

**Files:**
- Modify: `ruoyi-ui/src/views/stock/analyzer/index.vue`
- Modify: `ruoyi-ui/src/views/stock/watchlist/index.vue`
- Modify: `ruoyi-ui/src/views/stock/position/index.vue`
- Modify: `ruoyi-ui/src/api/stock/position.js`
- Modify: `ruoyi-ui/tests/stock-analysis-expand-toggle.test.js`
- Modify: `ruoyi-ui/tests/modular-stock-analysis-report.test.js`

- [ ] **Step 1: Extend source tests to fail on the old page behavior**

Add assertions:

```js
const analyzer = read('src/views/stock/analyzer/index.vue')
const watchlist = read('src/views/stock/watchlist/index.vue')
const position = read('src/views/stock/position/index.vue')
const positionApi = read('src/api/stock/position.js')

for (const [name, source] of Object.entries({ analyzer, watchlist, position })) {
  assert(source.includes("import StockAnalysisReport from '@/components/StockAnalysisReport'"), `${name} uses shared report`)
  assert(!source.includes('AI 分析</el-button>'), `${name} removes second AI action`)
  assert(!source.includes('aiLoading'), `${name} removes split AI loading state`)
}
assert(watchlist.includes("scene: 'WATCHLIST'"))
assert(!watchlist.includes('this.loadAnalysis(row)\n    }'))
assert(positionApi.includes('export const analyzePosition=id=>request'))
assert(!positionApi.includes('includeAi'))
assert(position.includes("snapshotStatus === 'LEGACY'"))
```

Update `stock-analysis-expand-toggle.test.js` to expect `@click="analyze(scope.row)"` and assert that `handleExpandChange` does not invoke `loadAnalysis` for watchlist rows without a report.

- [ ] **Step 2: Run frontend tests and confirm failure**

Run from `ruoyi-ui`:

```powershell
npm run test:stock-report
npm run test:stock-expand
npm run test:position-remove
```

Expected: report/expand tests fail on old imports, `includeAi`, and implicit watchlist analysis; position-remove remains green.

- [ ] **Step 3: Replace duplicate report templates and request flows**

For each page:

```vue
<StockAnalysisReport v-if="reportIsCurrent" :report="reportValue" />
```

- Analyzer: keep the search header, error alert, route query, and one loading state; send `{ stockCode: code, scene: 'ANALYZER' }`.
- Watchlist: `handleAnalyze` sends `{ stockCode: code, scene: 'WATCHLIST' }`, stores the response, then expands the row. `handleExpandChange` only synchronizes the expanded key; it never starts an analysis.
- Position: change `analyze(row, includeAi)` to `analyze(row)` and call `analyzePosition(id)`. Keep saved-report loading. For `LEGACY`, render a clear re-analysis prompt instead of `StockAnalysisReport`.
- Remove per-page signal, risk, AI, metric, and discipline rendering that is now owned by the shared component. Preserve CRUD, permissions, request-version guards, list summaries, and deletion cleanup.

Change the API to:

```js
export const analyzePosition = id => request({
  url: `/stock/position/${id}/analyze`,
  method: 'post'
})
```

- [ ] **Step 4: Run all frontend tests and build**

Run from `ruoyi-ui`:

```powershell
npm run test:stock-report
npm run test:stock-expand
npm run test:position-remove
npm run build:prod
```

Expected: all three Node tests print their pass messages and production build exits `0`.

- [ ] **Step 5: Commit page integration**

```powershell
git add -- ruoyi-ui/src/views/stock/analyzer/index.vue ruoyi-ui/src/views/stock/watchlist/index.vue ruoyi-ui/src/views/stock/position/index.vue ruoyi-ui/src/api/stock/position.js ruoyi-ui/tests/stock-analysis-expand-toggle.test.js ruoyi-ui/tests/modular-stock-analysis-report.test.js
git commit -m "refactor: use modular reports across stock pages"
```

## Task 10: Cross-layer regression and visual verification

**Files:**
- Verify all files listed above.
- Modify only the owning file for defects found by the commands or browser inspection.

- [ ] **Step 1: Run focused backend tests**

```powershell
mvn -pl ruoyi-system -Dtest=MarketDataPreparationTest,Stock520RuleEngineTest,DeepSeekStockAdvisorTest,StockAnalyzerServiceImplTest,StockPositionAnalysisSnapshotServiceImplTest,StockPositionServiceImplTest test
```

Expected: zero failures and zero errors.

- [ ] **Step 2: Run the complete backend reactor package**

```powershell
mvn clean package -DskipTests
```

Expected: every module ends with `SUCCESS` and the reactor summary ends with `BUILD SUCCESS`.

- [ ] **Step 3: Run all stock frontend contracts and production build**

From `ruoyi-ui`:

```powershell
npm run test:stock-report
npm run test:stock-expand
npm run test:position-remove
npm run build:prod
```

Expected: all contract tests pass and Vue reports a successful production build.

- [ ] **Step 4: Verify removed legacy behavior and required module gates**

```powershell
rg -n "includeAi|aiLoading|AI 分析</el-button>|getAiAdvice|getAiReason|getRiskLevel" ruoyi-ui/src/views/stock ruoyi-ui/src/api/stock ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock ruoyi-system/src/main/java/com/ruoyi/system
rg -n "01 基础信息|02 定趋势|03 找买点|04 止损|05 止盈|06 坚决不能犯的错误" ruoyi-ui/src/components/StockAnalysisReport/index.vue
```

Expected: the first command has no matches; the second finds all six headings.

- [ ] **Step 5: Inspect real page states in the local browser**

Run `npm run dev` from `ruoyi-ui`, then inspect analyzer, watchlist, and position pages at desktop, 768px, and 375px widths. Verify:

- base/trend/mistakes always render on a valid or partial report;
- buy points appear only for `UP`;
- stop/take appear only for position reports;
- a watchlist expand click alone makes no network analysis request;
- one analysis click produces one DeepSeek request in backend logs;
- DeepSeek failure leaves evidence visible;
- legacy position snapshot shows the re-analysis prompt;
- long evidence and AI text wrap without horizontal overflow.

- [ ] **Step 6: Check whitespace, changed-file scope, and final status**

```powershell
git diff --check
git status --short
git log -10 --oneline
```

Expected: no whitespace errors; only intentional stock-analysis files are changed; pre-existing user changes to `ruoyi-admin/src/main/resources/application.yml` and unrelated untracked files remain untouched.

- [ ] **Step 7: Commit only verified follow-up fixes, if any**

If Step 5 found defects, stage the exact owning files and commit:

```powershell
git commit -m "fix: polish modular stock analysis report"
```

If no files changed after verification, do not create an empty commit.
