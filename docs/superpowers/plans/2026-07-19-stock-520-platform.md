# 520 Stock Analysis Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing demo as a user-isolated RuoYi-Vue stock analysis platform with deterministic 520 rules, on-demand AI interpretation, watchlists, holdings, progressive batch analysis, and latest-result snapshots.

**Architecture:** Keep the existing modular monolith, but isolate normalized market data, pure rule evaluation, holding advice, external adapters, persistence, and web orchestration behind explicit interfaces. The Vue 2 UI uses three menu pages and shared report/chart components; batch progress is a frontend concurrency pool calling secure per-record endpoints.

**Tech Stack:** Java 17, Spring Boot 4, Spring Security, MyBatis XML, MySQL, JUnit 5, Mockito, Vue 2.6, Element UI 2.15, ECharts 5, Axios.

---

## Planned File Structure

The implementation creates or changes these focused units:

- `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/market/`: normalized `StockCode`, `DailyBar`, `MarketQuote`, and `MarketDataSet` types.
- `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule/`: rule enums, evidence/result types, moving-average calculation, completed-bar selection, `Stock520RuleEngine`, and `HoldingAdvisor`.
- `ruoyi-system/src/main/java/com/ruoyi/system/config/StockAnalysisProperties.java`: all rule/data thresholds.
- `ruoyi-system/src/main/java/com/ruoyi/system/gateway/stock/`: `MarketDataGateway`, Tencent/Sina adapter, and `AiStockAdvisor`.
- `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/`: persistence models and request/result DTOs.
- `ruoyi-system/src/main/java/com/ruoyi/system/mapper/stock/` and `ruoyi-system/src/main/resources/mapper/stock/`: watchlist, position, and snapshot persistence.
- `ruoyi-system/src/main/java/com/ruoyi/system/service/stock/`: watchlist, position, analysis orchestration, and snapshot services.
- `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/`: analyzer, watchlist, and position HTTP endpoints.
- `ruoyi-ui/src/api/stock/`: analyzer, watchlist, and position API clients.
- `ruoyi-ui/src/components/StockAnalysis/`: shared report, K-line chart, evidence list, AI panel, and bounded concurrency utility.
- `ruoyi-ui/src/views/stock/`: the three pages.
- `sql/stock_analysis.sql`: tables, indexes, menu entries, and permissions.

The existing `StockAnalyzerServiceImpl` is removed only after the new orchestrator and endpoints pass tests, so every intermediate commit remains buildable.

### Task 1: Test Foundation and Stock Identity

**Files:**
- Modify: `ruoyi-system/pom.xml`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/market/StockCode.java`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/domain/stock/market/StockCodeTest.java`

- [ ] **Step 1: Add the test dependency**

Add this dependency inside `ruoyi-system/pom.xml`:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
</dependency>
```

- [ ] **Step 2: Write the failing stock-code tests**

```java
package com.ruoyi.system.domain.stock.market;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class StockCodeTest
{
    @Test
    void normalizesShanghaiAndShenzhenCodes()
    {
        assertEquals("sh600519", StockCode.parse("600519").symbol());
        assertEquals("sz000001", StockCode.parse("sz000001").symbol());
        assertEquals("sz300750", StockCode.parse(" 300750 ").symbol());
    }

    @Test
    void rejectsUnsupportedOrMalformedCodes()
    {
        assertThrows(IllegalArgumentException.class, () -> StockCode.parse("830001"));
        assertThrows(IllegalArgumentException.class, () -> StockCode.parse("60051"));
        assertThrows(IllegalArgumentException.class, () -> StockCode.parse("hk00700"));
        assertThrows(IllegalArgumentException.class, () -> StockCode.parse(null));
    }
}
```

- [ ] **Step 3: Run the focused test and verify red**

Run:

```powershell
mvn -pl ruoyi-system -am -Dtest=StockCodeTest -Dsurefire.failIfNoSpecifiedTests=false test
```

Expected: compilation fails because `StockCode` does not exist.

- [ ] **Step 4: Implement the immutable stock identity**

```java
package com.ruoyi.system.domain.stock.market;

import java.util.Locale;
import java.util.Objects;
import java.util.regex.Pattern;

public record StockCode(String code, String market)
{
    private static final Pattern SUPPORTED = Pattern.compile("[036]\\d{5}");

    public StockCode
    {
        Objects.requireNonNull(code, "股票代码不能为空");
        Objects.requireNonNull(market, "市场不能为空");
        if (!SUPPORTED.matcher(code).matches())
        {
            throw new IllegalArgumentException("仅支持6位沪深A股代码");
        }
        String expected = code.charAt(0) == '6' ? "sh" : "sz";
        if (!expected.equals(market))
        {
            throw new IllegalArgumentException("股票代码与市场不匹配");
        }
    }

    public static StockCode parse(String raw)
    {
        if (raw == null)
        {
            throw new IllegalArgumentException("股票代码不能为空");
        }
        String value = raw.trim().toLowerCase(Locale.ROOT);
        if (value.startsWith("sh") || value.startsWith("sz"))
        {
            value = value.substring(2);
        }
        if (!SUPPORTED.matcher(value).matches())
        {
            throw new IllegalArgumentException("仅支持6位沪深A股代码");
        }
        return new StockCode(value, value.charAt(0) == '6' ? "sh" : "sz");
    }

    public String symbol()
    {
        return market + code;
    }
}
```

- [ ] **Step 5: Run the test and commit**

Run the focused Maven command again; expected: `Tests run: 2, Failures: 0, Errors: 0` and `BUILD SUCCESS`.

```powershell
git add ruoyi-system/pom.xml ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/market/StockCode.java ruoyi-system/src/test/java/com/ruoyi/system/domain/stock/market/StockCodeTest.java
git commit -m "test: add stock code domain foundation"
```

### Task 2: Normalized Bars, Completed-Day Selection, and Moving Averages

**Files:**
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/market/DailyBar.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule/TradingBarSelector.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule/MovingAverageCalculator.java`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/domain/stock/rule/TradingBarSelectorTest.java`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/domain/stock/rule/MovingAverageCalculatorTest.java`

- [ ] **Step 1: Write failing tests for precision and intraday exclusion**

Create fixtures with the canonical constructor `new DailyBar(date, open, high, low, close, volume)` and assert:

```java
@Test
void calculatesWithoutRoundingIntermediateValues()
{
    List<BigDecimal> closes = List.of(bd("1.001"), bd("2.002"), bd("3.003"), bd("4.004"), bd("5.005"));
    List<BigDecimal> ma = MovingAverageCalculator.calculate(closes, 5);
    assertEquals(new BigDecimal("3.0030000000"), ma.get(4));
}

@Test
void excludesTodaysBarBeforeMarketClose()
{
    LocalDate today = LocalDate.of(2026, 7, 20);
    List<DailyBar> selected = new TradingBarSelector(ZoneId.of("Asia/Shanghai"), LocalTime.of(15, 10))
        .completedBars(List.of(bar(today.minusDays(3)), bar(today.minusDays(1)), bar(today)),
            ZonedDateTime.of(today, LocalTime.of(14, 30), ZoneId.of("Asia/Shanghai")));
    assertEquals(List.of(today.minusDays(3), today.minusDays(1)), selected.stream().map(DailyBar::date).toList());
}
```

Also test that selector sorting removes duplicate dates and that a 15:11 clock retains today's bar.

- [ ] **Step 2: Run both tests and verify red**

```powershell
mvn -pl ruoyi-system -am -Dtest=TradingBarSelectorTest,MovingAverageCalculatorTest -Dsurefire.failIfNoSpecifiedTests=false test
```

Expected: missing `DailyBar`, selector, and calculator types.

- [ ] **Step 3: Implement the normalized bar and pure helpers**

`DailyBar` is this immutable record:

```java
public record DailyBar(LocalDate date, BigDecimal open, BigDecimal high, BigDecimal low,
                       BigDecimal close, long volume)
{
    public DailyBar
    {
        Objects.requireNonNull(date);
        Objects.requireNonNull(open);
        Objects.requireNonNull(high);
        Objects.requireNonNull(low);
        Objects.requireNonNull(close);
        if (close.signum() <= 0 || volume < 0) throw new IllegalArgumentException("无效日K数据");
    }

    public boolean bullish() { return close.compareTo(open) > 0; }
}
```

`MovingAverageCalculator.calculate` returns a list equal in size to its input, uses `null` before `period - 1`, and divides with scale 10 and `RoundingMode.HALF_UP`. `TradingBarSelector.completedBars` de-duplicates with a `TreeMap<LocalDate, DailyBar>` and removes today's bar when local time is before the configured close-confirmation time.

- [ ] **Step 4: Run focused tests and compile**

Expected: all selector/calculator tests pass.

```powershell
mvn -pl ruoyi-system -am -DskipTests compile
```

Expected: `BUILD SUCCESS`.

- [ ] **Step 5: Commit**

```powershell
git add ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/market/DailyBar.java ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule ruoyi-system/src/test/java/com/ruoyi/system/domain/stock/rule
git commit -m "feat: normalize completed bars and moving averages"
```

### Task 3: Rule Contracts, Trend, and Golden Cross

**Files:**
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/config/StockAnalysisProperties.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule/Trend.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule/SignalType.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule/ActionType.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule/EvidenceStatus.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule/RuleEvidence.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule/StockRuleResult.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule/Stock520RuleEngine.java`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/domain/stock/rule/Stock520RuleEngineTrendTest.java`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/domain/stock/rule/Stock520RuleEngineGoldenCrossTest.java`
- Test fixture: `ruoyi-system/src/test/java/com/ruoyi/system/domain/stock/rule/BarFixtures.java`

- [ ] **Step 1: Define failing behavior tests**

Use `BarFixtures` to generate deterministic bars, then assert exact contracts:

```java
assertEquals(Trend.UP, result.trend());
assertEquals(SignalType.GOLDEN_CROSS, result.primarySignal());
assertEquals(ActionType.CONSIDER_BUY, result.action());
assertEquals(EvidenceStatus.PASSED, result.evidence("golden.volumeRatio").status());
```

Create separate tests proving that a cross with a flat MA20, a 1.49 volume ratio, a falling MA5, or a close below MA20 cannot return `CONSIDER_BUY`. Add equality tests showing exactly ±0.15% is `FLAT`.

- [ ] **Step 2: Run the tests and verify red**

```powershell
mvn -pl ruoyi-system -am -Dtest=Stock520RuleEngineTrendTest,Stock520RuleEngineGoldenCrossTest -Dsurefire.failIfNoSpecifiedTests=false test
```

- [ ] **Step 3: Implement configuration and result contracts**

`StockAnalysisProperties` is a `@ConfigurationProperties(prefix = "stock.analysis")` bean with these defaults:

```java
private int trendLookbackDays = 3;
private BigDecimal trendDeadbandPct = new BigDecimal("0.15");
private int averageVolumeDays = 5;
private BigDecimal breakoutVolumeRatio = new BigDecimal("1.5");
private int retraceLookbackDays = 20;
private BigDecimal retraceRisePct = new BigDecimal("3.0");
private BigDecimal retraceDistancePct = new BigDecimal("2.0");
private BigDecimal retraceRemainingVolumeMin = new BigDecimal("0.30");
private BigDecimal retraceRemainingVolumeMax = new BigDecimal("0.50");
private int convergenceDays = 5;
private BigDecimal convergenceDistancePct = new BigDecimal("1.0");
private int breakoutLookbackDays = 20;
private BigDecimal stopLossPct = new BigDecimal("-5.0");
private BigDecimal takeProfitPct = new BigDecimal("3.0");
private int strongDays = 2;
private BigDecimal strongVolumeRatio = new BigDecimal("1.2");
private int batchConcurrency = 3;
private LocalTime closeConfirmationTime = LocalTime.of(15, 10);
```

Annotate the class with both `@Component` and `@ConfigurationProperties(prefix = "stock.analysis")`; no application-class scan change is required.

`RuleEvidence` is `record RuleEvidence(String key, String name, EvidenceStatus status, String actual, String threshold, String message)`. `StockRuleResult` stores trend, primary signal, action, summary, MA values, volume ratio, data date, ordered evidence, and exposes `evidence(String key)` by exact key.

- [ ] **Step 4: Implement trend and golden-cross evaluation**

The engine must calculate all MA series once, then evaluate:

```java
boolean crossed = previousMa5.compareTo(previousMa20) <= 0 && currentMa5.compareTo(currentMa20) > 0;
boolean bothRising = currentMa5.compareTo(previousMa5) > 0 && currentMa20.compareTo(previousMa20) > 0;
boolean priceAbove = current.close().compareTo(currentMa5) > 0 && current.close().compareTo(currentMa20) > 0;
boolean enoughVolume = volumeRatio.compareTo(properties.getBreakoutVolumeRatio()) >= 0;
boolean valid = trend == Trend.UP && crossed && bothRising && priceAbove && enoughVolume;
```

When invalid, preserve evidence for every condition and return `WATCH`; do not stop at the first failed condition.

- [ ] **Step 5: Run tests and commit**

Expected: all trend and golden-cross tests pass, followed by `mvn -pl ruoyi-system -am -DskipTests compile` success.

```powershell
git add ruoyi-system/src/main/java/com/ruoyi/system/config/StockAnalysisProperties.java ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule ruoyi-system/src/test/java/com/ruoyi/system/domain/stock/rule
git commit -m "feat: implement trend and golden cross rules"
```

### Task 4: Retrace and Convergence Rules

**Files:**
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule/Stock520RuleEngine.java`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/domain/stock/rule/Stock520RuleEngineRetraceTest.java`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/domain/stock/rule/Stock520RuleEngineConvergenceTest.java`
- Modify: `ruoyi-system/src/test/java/com/ruoyi/system/domain/stock/rule/BarFixtures.java`

- [ ] **Step 1: Add red tests for confirmed, pending, and invalid retraces**

Fixtures must independently vary these conditions: valid golden cross within 20 bars, post-cross rise exactly 3%, distance exactly 2%, retrace volume remaining exactly 30%/50%, recovered MA20, bullish confirmation above MA5, and confirmation volume above the prior day. Assert `PENDING` when the latest close is below MA20 but still inside the one-day recovery window; assert `FAILED` after the window expires.

- [ ] **Step 2: Add red tests for convergence breakout**

Assert a valid signal only when the five preceding bars have MA distance at or below 1%, the current bar crosses upward with both averages rising, volume ratio is at least 1.5, trend is `UP`, and the current close exceeds the highest high of the preceding 20 bars. Add one failing test per omitted condition.

- [ ] **Step 3: Run focused tests and verify failures**

```powershell
mvn -pl ruoyi-system -am -Dtest=Stock520RuleEngineRetraceTest,Stock520RuleEngineConvergenceTest -Dsurefire.failIfNoSpecifiedTests=false test
```

- [ ] **Step 4: Implement both rule evaluators without changing public contracts**

Use private focused methods and private nested records `RuleContext` and `RuleEvaluation` inside `Stock520RuleEngine` so these implementation details do not become public domain contracts:

```java
private RuleEvaluation evaluateRetrace(RuleContext context)
private RuleEvaluation evaluateConvergence(RuleContext context)
private OptionalInt lastValidGoldenCrossIndex(RuleContext context, int lookback)
private BigDecimal averageVolume(List<DailyBar> bars, int fromInclusive, int toExclusive)
private BigDecimal percent(BigDecimal numerator, BigDecimal denominator)
```

The safety-first primary-signal precedence for non-holdings is `DEATH_CROSS`, `CONVERGENCE_BREAKOUT`, `RETRACE`, `GOLDEN_CROSS`, `NONE`; all rule evidence remains present even when another signal becomes primary.

- [ ] **Step 5: Run all rule tests and commit**

```powershell
mvn -pl ruoyi-system -am -Dtest='Stock520RuleEngine*Test' -Dsurefire.failIfNoSpecifiedTests=false test
git add ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule/Stock520RuleEngine.java ruoyi-system/src/test/java/com/ruoyi/system/domain/stock/rule
git commit -m "feat: implement retrace and convergence rules"
```

### Task 5: Exit Rules and Holding Advice

**Files:**
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule/HoldingContext.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule/HoldingAnalysisResult.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule/HoldingAdvisor.java`
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule/Stock520RuleEngine.java`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/domain/stock/rule/HoldingAdvisorTest.java`

- [ ] **Step 1: Write priority and money-calculation tests**

Use a position of 1,200 shares at cost 38.60 and assert exact scale-independent values:

```java
assertEquals(0, result.costAmount().compareTo(new BigDecimal("46320.00")));
assertEquals(0, result.marketValue().compareTo(new BigDecimal("48240.00")));
assertEquals(0, result.profitAmount().compareTo(new BigDecimal("1920.00")));
assertEquals(0, result.profitPct().compareTo(new BigDecimal("4.1451")));
```

Add separate tests establishing priority: volume break below MA20 returns `CLEAR`; otherwise a loss at -5% or two closes below MA5 returns `STOP_LOSS`; otherwise profit above 3% returns `HOLD_STRONG` when strong-continuation evidence passes and `TAKE_PROFIT` when it does not; remaining cases return `HOLD` or `WATCH`. Assert that buy evidence never overrides a stop action.

- [ ] **Step 2: Run the test and verify red**

```powershell
mvn -pl ruoyi-system -am -Dtest=HoldingAdvisorTest -Dsurefire.failIfNoSpecifiedTests=false test
```

- [ ] **Step 3: Implement holding contracts and advisor**

```java
public record HoldingContext(BigDecimal costPrice, long quantity)
{
    public HoldingContext
    {
        if (costPrice == null || costPrice.signum() <= 0) throw new IllegalArgumentException("成本价必须大于0");
        if (quantity <= 0) throw new IllegalArgumentException("持仓数量必须大于0");
    }
}
```

`HoldingAdvisor.advise(StockRuleResult technical, List<DailyBar> bars, BigDecimal referencePrice, HoldingContext holding)` calculates monetary values with `BigDecimal`, selects one action by the approved priority, and adds evidence keys `holding.trendStop`, `holding.maxLoss`, `holding.ma5Stop`, `holding.takeProfit`, and `holding.strongContinuation`.

- [ ] **Step 4: Run all domain tests and commit**

```powershell
mvn -pl ruoyi-system -am -Dtest='StockCodeTest,TradingBarSelectorTest,MovingAverageCalculatorTest,Stock520RuleEngine*Test,HoldingAdvisorTest' -Dsurefire.failIfNoSpecifiedTests=false test
git add ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/rule ruoyi-system/src/test/java/com/ruoyi/system/domain/stock/rule
git commit -m "feat: add deterministic holding advice"
```

### Task 6: Market Data Gateway and Resilient Adapters

**Files:**
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/market/MarketQuote.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/market/MarketDataSet.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/gateway/stock/MarketDataGateway.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/gateway/stock/TencentSinaMarketDataGateway.java`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/gateway/stock/TencentSinaMarketDataGatewayTest.java`
- Modify: `ruoyi-framework/src/main/java/com/ruoyi/framework/config/RestTemplateConfig.java`

- [ ] **Step 1: Write adapter parsing and degradation tests**

With `MockRestServiceServer`, cover GBK Tencent parsing, Sina JSONP extraction, ascending sort/de-duplication, invalid code response, realtime failure with valid K lines, and K-line failure. The contract is:

```java
public interface MarketDataGateway
{
    MarketDataSet load(StockCode stockCode, ZonedDateTime now);
    MarketQuote validate(StockCode stockCode);
}
```

`MarketDataSet` contains `StockCode`, nullable realtime quote, completed bars, `realtimeAvailable`, and a non-sensitive warning list. `validate` must throw `ServiceException("股票代码不存在或行情暂不可用")` if no valid quote name and price are returned.

- [ ] **Step 2: Run the gateway test and verify red**

```powershell
mvn -pl ruoyi-system -am -Dtest=TencentSinaMarketDataGatewayTest -Dsurefire.failIfNoSpecifiedTests=false test
```

- [ ] **Step 3: Implement the adapter by extracting current demo behavior**

Move Tencent/Sina URL building, GBK parsing, JSONP trimming, numeric parsing, and logging out of `StockAnalyzerServiceImpl`. Never log response bodies. Feed parsed bars through `TradingBarSelector`. If realtime fails but K lines are valid, use the last completed close as `referencePrice` and set `realtimeAvailable=false`; if completed bars cannot support MA20 plus lookbacks, throw `ServiceException("日K数据不足，无法完成520分析")`.

- [ ] **Step 4: Run tests and commit**

```powershell
mvn -pl ruoyi-system -am -Dtest=TencentSinaMarketDataGatewayTest -Dsurefire.failIfNoSpecifiedTests=false test
mvn -pl ruoyi-system -am -DskipTests compile
git add ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/market ruoyi-system/src/main/java/com/ruoyi/system/gateway/stock ruoyi-system/src/test/java/com/ruoyi/system/gateway/stock ruoyi-framework/src/main/java/com/ruoyi/framework/config/RestTemplateConfig.java
git commit -m "refactor: isolate resilient market data gateway"
```

### Task 7: Database Schema, Models, and Mappers

**Files:**
- Create: `sql/stock_analysis.sql`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockWatchlist.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockPosition.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisSnapshot.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/mapper/stock/StockWatchlistMapper.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/mapper/stock/StockPositionMapper.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/mapper/stock/StockAnalysisSnapshotMapper.java`
- Create: `ruoyi-system/src/main/resources/mapper/stock/StockWatchlistMapper.xml`
- Create: `ruoyi-system/src/main/resources/mapper/stock/StockPositionMapper.xml`
- Create: `ruoyi-system/src/main/resources/mapper/stock/StockAnalysisSnapshotMapper.xml`

- [ ] **Step 1: Add exact schema with constraints**

Create three InnoDB/utf8mb4 tables using `bigint` IDs, `char(6)` stock code, `char(2)` market, `decimal(12,4)` prices/amounts, `decimal(9,4)` percentages, and standard RuoYi audit columns. Add unique keys `uk_watchlist_user_stock`, `uk_position_user_stock`, and `uk_snapshot_user_scene_stock`, plus `CHECK (cost_price > 0)` and `CHECK (quantity > 0)`; retain Service validation because database checks are not a substitute for stable API messages.

- [ ] **Step 2: Define mapper contracts with user ownership in every mutation**

The key signatures are:

```java
List<StockWatchlist> selectByUserId(Long userId);
StockWatchlist selectByIdAndUserId(@Param("id") Long id, @Param("userId") Long userId);
int insert(StockWatchlist row);
int deleteByIdAndUserId(@Param("id") Long id, @Param("userId") Long userId);

List<StockPosition> selectByUserId(Long userId);
StockPosition selectByIdAndUserId(@Param("id") Long id, @Param("userId") Long userId);
int insert(StockPosition row);
int updateByIdAndUserId(StockPosition row);
int deleteByIdAndUserId(@Param("id") Long id, @Param("userId") Long userId);

int upsert(StockAnalysisSnapshot snapshot);
int deleteByOwner(@Param("userId") Long userId, @Param("sceneType") String sceneType,
                  @Param("stockCode") String stockCode);
```

List queries left join the matching snapshot on user, scene, and stock code. Never fetch a business row by ID alone.

- [ ] **Step 3: Validate XML and compile**

```powershell
mvn -pl ruoyi-system -am -DskipTests compile
```

Expected: MyBatis interfaces and domain classes compile; manually confirm every XML namespace exactly matches its mapper interface.

- [ ] **Step 4: Commit**

```powershell
git add sql/stock_analysis.sql ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockWatchlist.java ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockPosition.java ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisSnapshot.java ruoyi-system/src/main/java/com/ruoyi/system/mapper/stock ruoyi-system/src/main/resources/mapper/stock
git commit -m "feat: add stock user data persistence"
```

### Task 8: User-Isolated Watchlist Service and Controller

**Files:**
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/service/stock/StockWatchlistService.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/service/stock/impl/StockWatchlistServiceImpl.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockCodeRequest.java`
- Create: `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockWatchlistController.java`
- Modify: `ruoyi-admin/pom.xml`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/service/stock/StockWatchlistServiceTest.java`
- Test: `ruoyi-admin/src/test/java/com/ruoyi/web/controller/stock/StockWatchlistControllerTest.java`

- [ ] **Step 1: Add `spring-boot-starter-test` to `ruoyi-admin/pom.xml` with test scope**

Use the same dependency block as Task 1 so MockMvc and Mockito are available in the web module.

- [ ] **Step 2: Write service tests before implementation**

Mock `MarketDataGateway` and mappers. Verify add normalizes code and writes server-provided name; duplicate-key `DuplicateKeyException` becomes `ServiceException("该股票已在自选中")`; delete passes both ID and user ID; selecting an ID owned by another user returns no row.

- [ ] **Step 3: Implement the service contract**

```java
public interface StockWatchlistService
{
    List<StockWatchlist> list(Long userId);
    StockWatchlist add(Long userId, String username, String rawCode);
    StockWatchlist requireOwned(Long id, Long userId);
    void remove(Long id, Long userId);
}
```

`requireOwned` throws `ServiceException("自选记录不存在")`. `remove` deletes the `WATCHLIST` snapshot in the same `@Transactional` method.

- [ ] **Step 4: Write and implement controller security tests**

Endpoints are `GET /stock/watchlist`, `POST /stock/watchlist`, and `DELETE /stock/watchlist/{id}` with permissions `stock:watchlist:list/add/remove`. The controller extends `BaseController`, passes `getUserId()` and `getUsername()` to the service, and never binds `userId` from JSON. A request body uses a focused `StockCodeRequest` containing only `@NotBlank String stockCode`.

- [ ] **Step 5: Run tests and commit**

```powershell
mvn -pl ruoyi-admin -am -Dtest=StockWatchlistServiceTest,StockWatchlistControllerTest -Dsurefire.failIfNoSpecifiedTests=false test
git add ruoyi-admin/pom.xml ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockWatchlistController.java ruoyi-admin/src/test/java/com/ruoyi/web/controller/stock/StockWatchlistControllerTest.java ruoyi-system/src/main/java/com/ruoyi/system/service/stock ruoyi-system/src/test/java/com/ruoyi/system/service/stock/StockWatchlistServiceTest.java
git commit -m "feat: add user-isolated stock watchlists"
```

### Task 9: User-Isolated Position Service and Controller

**Files:**
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockPositionRequest.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/service/stock/StockPositionService.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/service/stock/impl/StockPositionServiceImpl.java`
- Create: `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/service/stock/StockPositionServiceTest.java`
- Test: `ruoyi-admin/src/test/java/com/ruoyi/web/controller/stock/StockPositionControllerTest.java`

- [ ] **Step 1: Write red validation and ownership tests**

Cover zero/negative/null cost, zero/negative/null quantity, duplicate stock, another user's ID on update/delete, add with validated server-side name, and editing only cost/quantity. Explicitly assert that an update request cannot change `userId`, stock code, market, or name.

- [ ] **Step 2: Implement request validation and service**

```java
public class StockPositionRequest
{
    @NotBlank private String stockCode;
    @NotNull @DecimalMin(value = "0.0001") private BigDecimal costPrice;
    @NotNull @Min(1) private Long quantity;
    // conventional getters and setters for exactly these three fields
}
```

The service exposes `list`, `add`, `update`, `requireOwned`, and `remove`. On update it loads the owned row first and copies only `costPrice` and `quantity`; on removal it deletes the `POSITION` snapshot in one transaction.

- [ ] **Step 3: Implement endpoints and permissions**

Use `GET /stock/position`, `POST /stock/position`, `PUT /stock/position/{id}`, and `DELETE /stock/position/{id}` with `stock:position:list/add/edit/remove`. For update, the path ID is authoritative.

- [ ] **Step 4: Run tests and commit**

```powershell
mvn -pl ruoyi-admin -am -Dtest=StockPositionServiceTest,StockPositionControllerTest -Dsurefire.failIfNoSpecifiedTests=false test
git add ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockPositionRequest.java ruoyi-system/src/main/java/com/ruoyi/system/service/stock ruoyi-system/src/test/java/com/ruoyi/system/service/stock/StockPositionServiceTest.java ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java ruoyi-admin/src/test/java/com/ruoyi/web/controller/stock/StockPositionControllerTest.java
git commit -m "feat: add user-isolated stock positions"
```

### Task 10: Analysis Orchestrator, Snapshots, and AI Boundary

**Files:**
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/gateway/stock/AiStockAdvisor.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/gateway/stock/DeepSeekStockAdvisor.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/AiInterpretation.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisReport.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisRequest.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/service/stock/StockAnalysisService.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/service/stock/impl/StockAnalysisServiceImpl.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/service/stock/StockSnapshotService.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/service/stock/impl/StockSnapshotServiceImpl.java`
- Remove after migration: `ruoyi-system/src/main/java/com/ruoyi/system/service/IStockAnalyzerService.java`
- Remove after migration: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java`
- Remove after migration: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockRealtimeData.java`
- Remove after migration: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisResult.java`
- Remove after migration: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/AnalysisSignal.java`
- Modify: `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockAnalyzerController.java`
- Modify: `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockWatchlistController.java`
- Modify: `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/service/stock/StockAnalysisServiceTest.java`

- [ ] **Step 1: Write orchestration tests**

Mock gateways, rule engine, holding advisor, owned-record services, and snapshot mapper. Assert:

- plain analysis returns report and does not write a snapshot;
- watchlist analysis loads an owned row, runs rules without AI, and upserts `WATCHLIST` only on success;
- position analysis calculates holding values and upserts `POSITION` only on success;
- market failure leaves the previous snapshot untouched;
- AI analysis invokes AI exactly once and never replaces `report.action` with AI output;
- absent API key or AI failure returns the technical report with an AI-unavailable message.

- [ ] **Step 2: Implement the service contract**

```java
public interface StockAnalysisService
{
    StockAnalysisReport analyze(String rawCode, boolean includeAi);
    StockAnalysisReport analyzeWatchlist(Long watchlistId, Long userId, boolean includeAi);
    StockAnalysisReport analyzePosition(Long positionId, Long userId, boolean includeAi);
}
```

`StockAnalysisReport` includes identity, realtime/last-close quote, 60 completed bars with MA5/MA20 values, trend, primary signal, final action, summary, ordered evidence, warnings, market data date, analyzed time, optional holding section, and optional AI section. Snapshot mapping uses only current price, trend, signal, action, summary, holding profit values, market date, and analyzed time.

- [ ] **Step 3: Implement AI as append-only interpretation**

```java
public interface AiStockAdvisor
{
    AiInterpretation interpret(StockAnalysisReport technicalReport);
    boolean available();
}
```

Build the prompt from the report and instruct the model to explain the locked action. Return text in a dedicated `AiInterpretation`; do not parse or accept an AI-selected action. Set the Bearer header only inside `DeepSeekStockAdvisor` and redact secrets from logs.

- [ ] **Step 4: Replace controller routes and remove the legacy implementation**

Keep `POST /stock/analyzer/analyze`; add `/ai-analyze`, watchlist `/{id}/analyze` and `/{id}/ai-analyze`, and matching position routes. Use permissions `stock:analyzer:analyze`, `stock:analyzer:ai`, `stock:watchlist:analyze`, `stock:watchlist:ai`, `stock:position:analyze`, and `stock:position:ai`.

Delete the old interface, implementation, and three legacy response models only after all new route tests pass and `rg "IStockAnalyzerService|StockAnalyzerServiceImpl|StockRealtimeData|StockAnalysisResult|AnalysisSignal"` finds no consumers outside those legacy files.

- [ ] **Step 5: Run backend tests and commit**

```powershell
mvn -pl ruoyi-admin -am test
mvn -pl ruoyi-admin -am -DskipTests package
git add ruoyi-system/src/main/java/com/ruoyi/system/gateway/stock ruoyi-system/src/main/java/com/ruoyi/system/domain/stock ruoyi-system/src/main/java/com/ruoyi/system/service ruoyi-system/src/test/java/com/ruoyi/system/service/stock ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock
git commit -m "feat: orchestrate stock rules snapshots and ai"
```

### Task 11: Frontend APIs, Bounded Concurrency, and Shared Report Components

**Files:**
- Modify: `ruoyi-ui/src/api/stock/analyzer.js`
- Create: `ruoyi-ui/src/api/stock/watchlist.js`
- Create: `ruoyi-ui/src/api/stock/position.js`
- Create: `ruoyi-ui/src/components/StockAnalysis/batchRunner.js`
- Create: `ruoyi-ui/src/components/StockAnalysis/StockKlineChart.vue`
- Create: `ruoyi-ui/src/components/StockAnalysis/RuleEvidenceList.vue`
- Create: `ruoyi-ui/src/components/StockAnalysis/AiInterpretationPanel.vue`
- Create: `ruoyi-ui/src/components/StockAnalysis/StockAnalysisReport.vue`

- [ ] **Step 1: Implement focused API clients**

Export one function per backend route with exact HTTP verbs. Do not accept or send `userId`. Analyzer exports `analyzeStock(data)` and `aiAnalyzeStock(data)`; watchlist exports list/add/remove/analyze/aiAnalyze; position exports list/add/update/remove/analyze/aiAnalyze.

- [ ] **Step 2: Implement the bounded runner before page integration**

```javascript
export async function runBounded(items, worker, limit = 3, onState = () => {}) {
  const queue = items.slice()
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const item = queue.shift()
      onState(item, 'running')
      try {
        const result = await worker(item)
        onState(item, 'success', result)
      } catch (error) {
        onState(item, 'failed', error)
      }
    }
  })
  await Promise.all(runners)
}
```

Pages must pass `limit=3` and disable destructive row operations while that row is running.

- [ ] **Step 3: Build the K-line and evidence components**

`StockKlineChart` owns an ECharts instance, renders candle data plus MA5/MA20 lines from report bars, resizes on window resize, and disposes in `beforeDestroy`. `RuleEvidenceList` maps the four statuses to success/danger/warning/info tags and always shows actual value, threshold, and message.

- [ ] **Step 4: Build the composed report**

`StockAnalysisReport` renders final action first, realtime/non-realtime badge, stock quote, market data date, K-line chart, evidence list, holding section when present, rules disclaimer, and an `AiInterpretationPanel`. It emits `request-ai` rather than calling APIs itself so each parent selects the correct context route.

- [ ] **Step 5: Run production build and commit**

```powershell
npm run build:prod
```

Run from `ruoyi-ui`; expected: build completes without ESLint/template errors.

```powershell
git add ruoyi-ui/src/api/stock ruoyi-ui/src/components/StockAnalysis
git commit -m "feat: add reusable stock analysis frontend"
```

### Task 12: Rebuild the Single-Stock Analysis Page

**Files:**
- Replace: `ruoyi-ui/src/views/stock/analyzer/index.vue`

- [ ] **Step 1: Replace the demo layout with the approved hierarchy**

The page state is exactly:

```javascript
data() {
  return {
    stockCode: '',
    loading: false,
    aiLoading: false,
    report: null,
    errorMessage: ''
  }
}
```

Validate `/^[036]\d{5}$/` after stripping an optional `sh/sz` prefix. Render search, final conclusion, shared report, and empty/error states. Do not retain the old duplicated report markup or hard-coded signal interpretation maps inside the page.

- [ ] **Step 2: Wire technical and AI actions**

`handleAnalyze` calls only `analyzeStock`; `handleAi` calls `aiAnalyzeStock`, replaces the report with the response, and leaves the existing technical report visible if AI fails. Disable AI until a technical report exists.

- [ ] **Step 3: Build and visually verify**

```powershell
npm run build:prod
```

Expected: success. Verify 600519 and 000001 input normalization, invalid-code warning, loading state, non-realtime warning, chart resize, and AI error isolation.

- [ ] **Step 4: Commit**

```powershell
git add ruoyi-ui/src/views/stock/analyzer/index.vue
git commit -m "feat: rebuild single stock analysis page"
```

### Task 13: Build the Watchlist Page with Progressive Batch Analysis

**Files:**
- Create: `ruoyi-ui/src/views/stock/watchlist/index.vue`

- [ ] **Step 1: Build CRUD and latest-summary table**

The page loads on `created`, adds by code dialog, confirms delete, and renders stock name/code, latest price, trend, signal, action, market date, and analyzed time. Each row has transient `_analysisState` and `_analysisError` fields populated only in the Vue model, never sent to the backend.

- [ ] **Step 2: Implement single and batch analysis**

Single analysis calls `analyzeWatchlist(id)`, refreshes the row/list, and opens the shared report drawer. Batch analysis executes:

```javascript
await runBounded(this.rows, row => analyzeWatchlist(row.watchlistId), 3,
  (row, state, payload) => this.applyAnalysisState(row, state, payload))
```

On success update that row's summary immediately; on failure retain its old summary and expose “重试”. Show final success/failure counts. AI calls only the selected row's `aiAnalyzeWatchlist` endpoint.

- [ ] **Step 3: Build and verify edge cases**

Verify empty list, duplicate add, 20 rows, exactly three concurrent running indicators, a middle-item failure, retry, delete confirmation, and drawer close/reopen.

```powershell
npm run build:prod
```

- [ ] **Step 4: Commit**

```powershell
git add ruoyi-ui/src/views/stock/watchlist/index.vue
git commit -m "feat: add progressive watchlist analysis"
```

### Task 14: Build the Position Page with Holding Context

**Files:**
- Create: `ruoyi-ui/src/views/stock/position/index.vue`

- [ ] **Step 1: Build add/edit validation and table**

Use one dialog with these Element UI rules: stock code required and pattern validated on add; cost required and greater than zero; quantity required, integer, and greater than zero. Editing disables stock code and sends only current code, cost, and quantity accepted by the DTO. Render per-stock cost amount, current value, profit amount/pct, trend, signal, action, and timestamp; never aggregate account totals.

- [ ] **Step 2: Add single, batch, report, and AI actions**

Reuse `runBounded` with `analyzePosition(positionId)`. Use red for A-share gains and green for losses consistently. The report drawer passes holding context to `StockAnalysisReport`; AI uses `aiAnalyzePosition` for the selected owned record.

- [ ] **Step 3: Build and verify**

Verify decimal costs, odd-lot positive integer quantity, update, duplicate stock, positive/negative P&L, stop-loss priority, batch partial failure, and no account-total UI.

```powershell
npm run build:prod
```

- [ ] **Step 4: Commit**

```powershell
git add ruoyi-ui/src/views/stock/position/index.vue
git commit -m "feat: add holding-aware stock analysis page"
```

### Task 15: Menus, Configuration, Documentation, and Final Verification

**Files:**
- Modify: `sql/stock_analysis.sql`
- Delete: `sql/stock_menu.sql`
- Modify: `ruoyi-admin/src/main/resources/application.yml`
- Modify: `README.md`
- Modify: `doc/deployment-bare.md`

- [ ] **Step 1: Complete menu and permission SQL**

Under “股票管理”, create menu components `stock/analyzer/index`, `stock/watchlist/index`, and `stock/position/index`. Add button permissions matching every Controller string. Use IDs that do not collide with `sql/ry_20260417.sql`; delete the obsolete `sql/stock_menu.sql` and document that operators execute only the consolidated `sql/stock_analysis.sql`.

- [ ] **Step 2: Add non-secret configuration**

Add the `stock.analysis` defaults from Task 3, data-source URLs, timeouts, and close-confirmation time to `application.yml`. Keep `deepseek.api-key` empty or environment-substituted; document `DEEPSEEK_API_KEY` configuration without committing a real key.

- [ ] **Step 3: Update operator documentation**

Document SQL execution, supported codes, network access to both market sources, deterministic batch behavior, optional AI, user-isolation model, data dates/non-realtime fallback, and the investment-risk disclaimer.

- [ ] **Step 4: Run the complete verification suite**

From repository root:

```powershell
mvn -pl ruoyi-admin -am test
mvn -pl ruoyi-admin -am -DskipTests package
```

From `ruoyi-ui`:

```powershell
npm run build:prod
```

Expected: both Maven commands and the Vue production build exit 0. Also run:

```powershell
rg -n "IStockAnalyzerService|StockAnalyzerServiceImpl|StockRealtimeData|StockAnalysisResult|AnalysisSignal|GOLDEN_CROSS_WEAK" ruoyi-admin ruoyi-system ruoyi-ui
git diff --check
git status --short
```

Expected: no legacy implementation references, no whitespace errors, and only the intended documentation/config/SQL files remain uncommitted before the final commit.

- [ ] **Step 5: Perform manual acceptance with two users**

Using two RuoYi users, verify each can create the same stock independently but cannot read/update/delete/analyze the other's IDs. For one user, test 20 mixed self-selected/held stocks, a batch with one simulated market-data failure, a holding at -5%, a holding in the 3%–5% profit band, and AI disabled. Confirm old snapshots survive a failed K-line refresh.

- [ ] **Step 6: Commit the delivery files**

```powershell
git add -A sql/stock_analysis.sql sql/stock_menu.sql ruoyi-admin/src/main/resources/application.yml README.md doc/deployment-bare.md
git commit -m "docs: complete stock analysis deployment"
```

## Completion Criteria

- All deterministic rules use only completed daily bars and expose actual-versus-threshold evidence.
- Stop actions cannot be overridden by buy signals or AI text.
- Every watchlist/position operation is constrained by the authenticated user.
- Batch analysis never exceeds three concurrent requests and retains per-row success/failure state.
- Successful rule analysis replaces only the matching latest snapshot; failure preserves it.
- Full Maven tests/package and Vue production build pass from a clean worktree.
