# 520 三步走策略报告与均线配色实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正 K 线图 MA5/MA10/MA20 的折线与图例配色，并在 AI 分析结果中提供“先数据、后原因”的 520 三步走结构化报告；只有“我的持仓”增加止损止盈判断。

**Architecture:** 新增强类型 `strategyReport` 领域模型和独立的 `StockStrategyReportEvaluator`。技术数据只计算一次，趋势、三类买点、兼容 `signal` 和仓位建议都从同一份评估结果派生；持仓分析在补齐真实成本、盈亏和仓位后再追加专属退出规则，最后才允许调用 DeepSeek。前端新增一个共享报告组件，三个页面复用，但由页面现有 `aiShown`/AI 请求状态控制展示时机。

**Tech Stack:** Java 8, Spring Boot, JUnit 5, Fastjson2/Jackson-compatible Java beans, Vue 2.6, Element UI 2.15, ECharts 5.4, Node.js `assert` source-contract tests, Maven, Vue CLI.

---

## File Structure

- Create `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StrategyEvidence.java`: 单条原始数据、阈值和通过状态。
- Create `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StrategyRuleResult.java`: 单条趋势、买点、退出或仓位规则结果。
- Create `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockStrategyReport.java`: 三步走报告聚合模型。
- Create `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/StockStrategyReportEvaluator.java`: 520 确定性规则唯一计算入口。
- Create `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/StockStrategyReportEvaluatorTest.java`: 趋势、买点、止损止盈、优先级和仓位上限边界测试。
- Modify `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisResult.java`: 增加可选 `strategyReport`。
- Modify `ruoyi-system/src/main/java/com/ruoyi/system/service/IStockAnalyzerService.java`: 增加持仓完整分析入口。
- Modify `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java`: 构造统一 K 线数据、调用规则评估器、生成兼容信号、调整 DeepSeek 输入顺序。
- Modify `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java`: 验证普通/AI/持仓数据流和提示词。
- Modify `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java`: 把持仓资料交给服务层完整分析，不再在 AI 调用后才补持仓数据。
- Create `ruoyi-ui/src/views/stock/analyzer/components/StockStrategyReport.vue`: 三页面复用的三步走展示组件。
- Create `ruoyi-ui/tests/stock-strategy-report.test.js`: 报告结构、数据先于原因、页面差异和旧数据兼容测试。
- Modify `ruoyi-ui/src/utils/stock-kline.js`: 统一折线和图例标记颜色。
- Modify `ruoyi-ui/tests/stock-kline-chart.test.js`: 精确断言三个 MA 系列颜色及图例一致性。
- Modify `ruoyi-ui/src/views/stock/analyzer/index.vue`: 在 AI 总结前展示非持仓三步走报告。
- Modify `ruoyi-ui/src/views/stock/watchlist/index.vue`: 仅 AI 分析展开时展示非持仓三步走报告。
- Modify `ruoyi-ui/src/views/stock/position/index.vue`: 仅 AI 分析展开时展示带四项止损止盈的报告。
- Modify `ruoyi-ui/tests/stock-analyzer-session.test.js`: 注入新增组件并覆盖旧会话缺少报告的兼容状态。
- Modify `ruoyi-ui/tests/watchlist-position-kline.test.js`: 保留 K 线在顶部并断言三个页面的报告插入位置。
- Modify `ruoyi-ui/package.json`: 增加报告专用测试命令。

### Task 1: 锁定 MA 折线和图例颜色

**Files:**
- Modify: `ruoyi-ui/tests/stock-kline-chart.test.js`
- Modify: `ruoyi-ui/src/utils/stock-kline.js`

- [ ] **Step 1: 先写精确颜色失败测试**

在 `stock-kline-chart.test.js` 现有 `option` 断言后加入：

```js
const expectedMaColors = ['#000000', '#F5C400', '#E5484D']
assert.deepStrictEqual(
  option.series.slice(1, 4).map(series => series.lineStyle.color),
  expectedMaColors
)
assert.deepStrictEqual(
  option.series.slice(1, 4).map(series => series.itemStyle.color),
  expectedMaColors
)
```

这里使用每个折线系列的 `itemStyle.color` 作为 ECharts 图例标记色来源，避免只设置 `lineStyle` 后由全局调色盘给图例分配其他颜色。

- [ ] **Step 2: 运行测试并确认按预期失败**

Run from `ruoyi-ui`:

```powershell
npm run test:stock-kline
```

Expected: FAIL，实际颜色仍为蓝/黄/紫，或 `itemStyle` 不存在。

- [ ] **Step 3: 最小化修改图表配置**

把 `MA_COLORS` 改为：

```js
const MA_COLORS = ['#000000', '#F5C400', '#E5484D']
```

三个均线系列同时设置：

```js
lineStyle: { color: MA_COLORS[index] },
itemStyle: { color: MA_COLORS[index] }
```

不修改 K 线和成交量的红涨绿跌颜色。

- [ ] **Step 4: 运行图表测试并提交**

```powershell
npm run test:stock-kline
git add -- src/utils/stock-kline.js tests/stock-kline-chart.test.js
git commit -m "fix: align moving average chart colors"
```

Expected: 测试通过，提交仅包含上述两个文件。

### Task 2: 建立强类型策略报告合同

**Files:**
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StrategyEvidence.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StrategyRuleResult.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockStrategyReport.java`
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisResult.java`
- Create: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/StockStrategyReportEvaluatorTest.java`

- [ ] **Step 1: 写领域合同失败测试**

创建 `StockStrategyReportEvaluatorTest`，先只验证可构造的响应合同：

```java
@Test
void exposesTypedThreeStepReportOnAnalysisResult()
{
    StrategyEvidence evidence = new StrategyEvidence("ma20Current", 10.25, "10.25", "> 前一日 MA20", "PASS");
    StrategyRuleResult trend = new StrategyRuleResult();
    trend.setCode("TREND");
    trend.setStatus("SATISFIED");
    trend.setEvidence(Arrays.asList(evidence));

    StockStrategyReport report = new StockStrategyReport();
    report.setTrendStep(trend);
    report.setBuyPointStep(new ArrayList<>());
    report.setExitStep(null);

    StockAnalysisResult result = new StockAnalysisResult();
    result.setStrategyReport(report);

    assertSame(report, result.getStrategyReport());
    assertNull(result.getStrategyReport().getExitStep());
}
```

- [ ] **Step 2: 运行测试并确认编译失败**

Run from repository root:

```powershell
mvn -pl ruoyi-system -am -Dtest=StockStrategyReportEvaluatorTest -Dsurefire.failIfNoSpecifiedTests=false test
```

Expected: FAIL，三个领域类和 `strategyReport` getter/setter 尚不存在。

- [ ] **Step 3: 实现最小 Java bean 合同**

字段固定如下：

```text
StrategyEvidence:
  label, value(Object), displayValue, threshold, status

StrategyRuleResult:
  code, name, status, action, evidence(List<StrategyEvidence>), conclusion, reason

StockStrategyReport:
  trendStep, buyPointStep(List<StrategyRuleResult>),
  exitStep(List<StrategyRuleResult>, nullable), positionStep, summary
```

状态只使用设计中稳定字符串：证据 `PASS/FAIL/INSUFFICIENT`；规则 `SATISFIED/NOT_SATISFIED/SKIPPED/INSUFFICIENT`。所有集合默认初始化为空列表，`exitStep` 保持可空，以明确区分非持仓报告。

- [ ] **Step 4: 运行领域合同测试并提交**

```powershell
mvn -pl ruoyi-system -am -Dtest=StockStrategyReportEvaluatorTest -Dsurefire.failIfNoSpecifiedTests=false test
git add -- ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StrategyEvidence.java ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StrategyRuleResult.java ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockStrategyReport.java ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisResult.java ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/StockStrategyReportEvaluatorTest.java
git commit -m "feat: define structured 520 strategy report"
```

### Task 3: 用同一规则评估器计算趋势和三类买点

**Files:**
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/StockStrategyReportEvaluator.java`
- Modify: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/StockStrategyReportEvaluatorTest.java`

- [ ] **Step 1: 写趋势边界和跳过逻辑测试**

用测试辅助方法构造带 `close/ma5/ma20/volume` 的 `StockKlineData`，覆盖：

```java
@Test void marksTrendUpAbovePointOnePercent()
@Test void marksTrendFlatAtPointOnePercentBoundary()
@Test void marksTrendDownBelowNegativePointOnePercent()
@Test void marksTrendInsufficientWhenMa20IsMissing()
@Test void keepsAllThreeBuyCardsWithEvidenceButSkipsThemWhenTrendIsNotUp()
```

最后一个测试必须同时断言 `buyPointStep.size() == 3`、三项状态均为 `SKIPPED`、每项 `evidence` 非空且原因说明趋势前置条件未满足。

- [ ] **Step 2: 写三类买点失败测试**

覆盖临界值和反例：

```java
@Test void confirmsGoldenCrossAtExactlyOnePointFiveVolumeRatio()
@Test void rejectsGoldenCrossWithoutVolumeConfirmationAndExplainsWhy()
@Test void evaluatesPullbackNearMa20WithRecentValidGoldenCross()
@Test void keepsWeakPullbackConclusionWhenPricePassesButVolumeDoesNotContract()
@Test void rejectsConvergenceAfterOnlyFourDays()
@Test void confirmsFiveDayConvergenceThenUpwardDivergenceAtOnePointFiveVolume()
```

每个测试都断言数据证据包含实际值、阈值和状态，并断言 `conclusion/reason` 不为空。

- [ ] **Step 3: 运行测试并确认类缺失或规则失败**

```powershell
mvn -pl ruoyi-system -am -Dtest=StockStrategyReportEvaluatorTest -Dsurefire.failIfNoSpecifiedTests=false test
```

- [ ] **Step 4: 实现技术评估器**

提供单一入口：

```java
public StockStrategyReport evaluateTechnical(StockRealtimeData stock, List<StockKlineData> bars)
public AnalysisSignal toAnalysisSignal(StockStrategyReport report)
```

实现约束：

- 趋势证据顺序固定：当前 MA20、前一日 MA20、变化值、变化率、收盘价相对 MA20。
- `abs(changePct) <= 0.1` 为走平；更大时按正负为向上/向下；缺值为 `INSUFFICIENT`。
- 买点列表固定顺序：`GOLDEN_CROSS`、`PULLBACK`、`CONVERGENCE_BREAKOUT`。
- 金叉要求前一日 `MA5 < MA20`、当前 `MA5 >= MA20`、当日/前日成交量 `>= 1.5`。
- 回踩沿用近期有效金叉、距 MA20 约 2%、不低于 MA20 的 98%，缩量单独列证据；价格满足而量能不足时保留弱结论。
- 粘合要求距离不超过 1% 连续至少 5 个交易日，随后 MA5 向上且高于 MA20，成交量达到近期均量 1.5 倍。
- `toAnalysisSignal` 只读取 `StockStrategyReport` 的规则状态、动作和证据，不再次计算 MA/量价条件；确保旧 `signal` 与新报告不矛盾。
- 使用集中常量保存 0.1%、1%、2%、98%、1.5 倍和 5 日阈值，禁止散落魔法数字。

- [ ] **Step 5: 运行评估器测试并提交**

```powershell
mvn -pl ruoyi-system -am -Dtest=StockStrategyReportEvaluatorTest -Dsurefire.failIfNoSpecifiedTests=false test
git add -- ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/StockStrategyReportEvaluator.java ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/StockStrategyReportEvaluatorTest.java
git commit -m "feat: evaluate 520 trend and buy points"
```

### Task 4: 把规则报告接入普通分析并保证 AI 故障不影响报告

**Files:**
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java`
- Modify: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java`

- [ ] **Step 1: 写服务数据流失败测试**

在现有测试中加入可注入/可覆盖行情数据的测试夹具，覆盖：

```java
@Test void returnsTechnicalStrategyReportWithoutRequestingAi()
@Test void leavesExitStepNullForNonPositionAnalysis()
@Test void mapsCompatibilitySignalFromStrategyReport()
@Test void preservesStrategyReportWhenDeepSeekIsNotConfigured()
@Test void preservesStrategyReportWhenDeepSeekThrows()
```

为避免真实网络，必要时把行情抓取、规则评估和 DeepSeek 调用调整为 package-private seam，或通过 `MockRestServiceServer` 提供固定响应；测试不得依赖腾讯、新浪或 DeepSeek 在线可用。

- [ ] **Step 2: 运行测试并确认新断言失败**

```powershell
mvn -pl ruoyi-system -am -Dtest=StockAnalyzerServiceImplTest -Dsurefire.failIfNoSpecifiedTests=false test
```

- [ ] **Step 3: 重排 `analyze` 的构造顺序**

按以下顺序实现：

```text
获取一次实时行情和原始 K 线
  -> 生成同一时点的 List<StockKlineData>
  -> evaluateTechnical
  -> toAnalysisSignal
  -> 先构造完整 StockAnalysisResult（含 strategyReport/klineData/indicators）
  -> includeAi=true 时再调用 DeepSeek 并只填充 AI 三字段
```

删除或停用旧 `detectSignals` 的独立规则计算，避免 3 日粘合旧阈值继续影响 `signal`。`includeAi=false` 返回的技术结果也要携带 `strategyReport`，但前端普通分析流程不展示它。DeepSeek 失败 catch 块只能写 `aiAdvice/aiReason/riskLevel`，不得清空报告。

- [ ] **Step 4: 运行服务和评估器测试并提交**

```powershell
mvn -pl ruoyi-system -am -Dtest=StockAnalyzerServiceImplTest,StockStrategyReportEvaluatorTest -Dsurefire.failIfNoSpecifiedTests=false test
git add -- ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java
git commit -m "feat: return deterministic 520 strategy report"
```

### Task 5: 增加持仓专属止损、止盈和仓位优先级

**Files:**
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/StockStrategyReportEvaluator.java`
- Modify: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/StockStrategyReportEvaluatorTest.java`

- [ ] **Step 1: 写四项退出规则失败测试**

新增：

```java
@Test void triggersShortStopWhenCloseFallsBelowMa5()
@Test void triggersTrendStopOnlyWhenCloseFallsBelowMa20OnOnePointFiveVolume()
@Test void suggestsRegularTakeProfitBetweenThreeAndFivePercent()
@Test void keepsStrongWinnerAboveFivePercentWhileTrendConditionsHold()
@Test void exitsStrongWinnerOnlyWhenDeathCrossRemainsUnrecoveredNextTradingDay()
@Test void fallsBackToRegularTakeProfitAboveFivePercentWithoutStrongConditions()
```

强势清仓测试数据必须明确包含 T-2、T-1、T 三根 K 线，验证 T-1 发生死叉且 T 日仍 `MA5 < MA20`、收盘未站回 MA20。

- [ ] **Step 2: 写执行优先级和仓位上限测试**

```java
@Test void prioritizesTrendStopOverAllBuyAndTakeProfitActions()
@Test void prioritizesShortStopOverTakeProfitAndAddPosition()
@Test void neverSuggestsAddingPastFiftyPercentTotalPosition()
@Test void keepsExitStepAbsentUntilPositionContextIsApplied()
```

- [ ] **Step 3: 运行测试并确认失败**

```powershell
mvn -pl ruoyi-system -am -Dtest=StockStrategyReportEvaluatorTest -Dsurefire.failIfNoSpecifiedTests=false test
```

- [ ] **Step 4: 实现持仓上下文增强**

新增入口：

```java
public StockStrategyReport applyPositionContext(
    StockStrategyReport technicalReport,
    List<StockKlineData> bars,
    Map<String, Object> holding)
```

它必须生成固定顺序四项 `exitStep`：`SHORT_STOP`、`TREND_STOP`、`REGULAR_TAKE_PROFIT`、`STRONG_TAKE_PROFIT`，并重算最终 `positionStep`。优先级固定为：趋势止损 > 短线止损 > 强势死叉确认退出 > 常规止盈 > 买点/加仓 > 持有/观望。任何加仓建议需使用当前 `positionPct` 算出可增加空间并封顶 50%。

对成本为零、总资产为空/零、K 线不足等情况给出 `INSUFFICIENT`，不得用 0 冒充有效百分比。

- [ ] **Step 5: 运行评估器测试并提交**

```powershell
mvn -pl ruoyi-system -am -Dtest=StockStrategyReportEvaluatorTest -Dsurefire.failIfNoSpecifiedTests=false test
git add -- ruoyi-system/src/main/java/com/ruoyi/system/service/impl/stock/StockStrategyReportEvaluator.java ruoyi-system/src/test/java/com/ruoyi/system/service/impl/stock/StockStrategyReportEvaluatorTest.java
git commit -m "feat: evaluate position exits and sizing"
```

### Task 6: 修正持仓分析顺序并把完整持仓报告交给 DeepSeek

**Files:**
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/service/IStockAnalyzerService.java`
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java`
- Modify: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java`
- Modify: `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java`

- [ ] **Step 1: 写持仓服务和提示词失败测试**

增加接口测试及 package-private 提示词构造测试：

```java
@Test void positionAnalysisAddsHoldingAndExitRulesBeforeAiCall()
@Test void positionDeepSeekPromptContainsCostProfitPositionAndFourExitRules()
@Test void technicalDeepSeekPromptDoesNotInventPositionExitRules()
```

提示词断言至少包含：成本价/成本金额、当前市值、盈亏金额、盈亏比例、当前仓位，以及 `SHORT_STOP/TREND_STOP/REGULAR_TAKE_PROFIT/STRONG_TAKE_PROFIT` 的状态和原因。

- [ ] **Step 2: 运行测试并确认失败**

```powershell
mvn -pl ruoyi-system -am -Dtest=StockAnalyzerServiceImplTest,StockStrategyReportEvaluatorTest -Dsurefire.failIfNoSpecifiedTests=false test
```

- [ ] **Step 3: 增加完整持仓分析入口**

在接口和实现中增加：

```java
StockAnalysisResult analyzePosition(StockPosition position, StockAccount account, boolean includeAi);
```

实现顺序必须是：

```text
analyze(stockCode, false)
  -> 计算并 setHolding
  -> evaluator.applyPositionContext
  -> 补充指数趋势
  -> includeAi=true 时 callDeepSeek(完整 result)
  -> 返回 controller 保存快照
```

把 `callDeepSeek` 调整为接收完整 `StockAnalysisResult`，并抽出 package-private：

```java
String buildDeepSeekPrompt(StockAnalysisResult result)
```

提示词明确要求 DeepSeek 仅输出综合建议、综合理由和风险等级，不重新裁决或覆盖确定性规则。可只附最近五根 K 线，但必须附完整 `strategyReport` 和存在时的 `holding`。

- [ ] **Step 4: 简化持仓 Controller**

Controller 只负责权限、读取用户持仓/账户、调用 `analyzePosition`、在 `includeAi=false` 时按现有行为保留旧 AI 三字段、保存快照并返回。删除 Controller 内“AI 调用后才计算 holding”的旧顺序。

注意不要格式化或改动用户已有的 `ruoyi-admin/src/main/resources/application.yml`。

- [ ] **Step 5: 运行后端相关测试并提交**

```powershell
mvn -pl ruoyi-system,ruoyi-admin -am -Dtest=StockAnalyzerServiceImplTest,StockStrategyReportEvaluatorTest,StockPositionAnalysisSnapshotServiceImplTest -Dsurefire.failIfNoSpecifiedTests=false test
git add -- ruoyi-system/src/main/java/com/ruoyi/system/service/IStockAnalyzerService.java ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java
git commit -m "feat: analyze holdings before AI summary"
```

### Task 7: 创建共享“三步走”报告组件

**Files:**
- Create: `ruoyi-ui/src/views/stock/analyzer/components/StockStrategyReport.vue`
- Create: `ruoyi-ui/tests/stock-strategy-report.test.js`
- Modify: `ruoyi-ui/package.json`

- [ ] **Step 1: 写组件结构失败测试**

创建源代码合同测试，断言：

- 组件有 `report` Object prop 和 `showExitStep` Boolean prop。
- 第一、第二、第三步标题存在。
- 趋势证据、三张买点卡、仓位建议存在。
- `v-for="item in rule.evidence"` 所在证据容器在 `rule.reason` 原因容器之前。
- `exitStep` 只有 `showExitStep && report.exitStep` 时渲染。
- 状态同时输出中文文本和 class，不只依赖颜色。
- 缺失数据以 `--` 显示。

在 `package.json` 增加：

```json
"test:stock-strategy": "node tests/stock-strategy-report.test.js"
```

- [ ] **Step 2: 运行测试并确认组件缺失**

```powershell
npm run test:stock-strategy
```

Working directory: `ruoyi-ui`.

- [ ] **Step 3: 实现共享组件**

组件结构固定为：

```text
第一步 定趋势
  状态 -> 证据网格 -> 结论 -> 原因
第二步 找买点
  金叉 / 回踩 / 粘合发散，各自状态 -> 证据 -> 结论 -> 原因
持仓专属退出判断（showExitStep=true 才存在）
  短线止损 / 趋势止损 / 常规止盈 / 强势止盈
第三步 仓位管理
  证据 -> 最终建议 -> 原因
```

为 `SATISFIED/NOT_SATISFIED/SKIPPED/INSUFFICIENT` 提供明确中文标签。CSS 使用项目现有 `stock-card`/`stock-badge` 视觉语言，窄屏证据网格降为单列。

- [ ] **Step 4: 运行组件测试并提交**

```powershell
npm run test:stock-strategy
git add -- package.json tests/stock-strategy-report.test.js src/views/stock/analyzer/components/StockStrategyReport.vue
git commit -m "feat: add shared 520 strategy report component"
```

### Task 8: 在分析、自选和持仓页面按正确时机展示

**Files:**
- Modify: `ruoyi-ui/tests/stock-strategy-report.test.js`
- Modify: `ruoyi-ui/tests/stock-analyzer-session.test.js`
- Modify: `ruoyi-ui/tests/watchlist-position-kline.test.js`
- Modify: `ruoyi-ui/src/views/stock/analyzer/index.vue`
- Modify: `ruoyi-ui/src/views/stock/watchlist/index.vue`
- Modify: `ruoyi-ui/src/views/stock/position/index.vue`

- [ ] **Step 1: 扩展三页面失败测试**

断言以下页面合同：

```text
分析页：K 线仍是第一张卡；strategyReport 位于旧 DeepSeek 总结之前；showExitStep=false。
自选页：仅 aiShown[row.stockCode] 区域内展示报告；showExitStep=false。
持仓页：仅 aiShown[row.positionId] 区域内展示报告；showExitStep=true。
全部页面：strategyReport 缺失时显示“历史结果不含三步走报告，请重新进行 AI 分析”，旧报价/K线/AI 文本仍保留。
```

同时更新 `stock-analyzer-session.test.js` 的脚本转换，增加：

```js
.replace("import StockStrategyReport from './components/StockStrategyReport.vue'", 'const StockStrategyReport = injectedStockStrategyReport')
```

并在 sandbox 注入空对象，防止新增 import 破坏现有会话行为测试。

- [ ] **Step 2: 运行相关测试并确认失败**

```powershell
npm run test:stock-strategy
npm run test:stock-session
npm run test:stock-list-kline
```

- [ ] **Step 3: 接入分析页**

导入并注册 `StockStrategyReport`。主分析页本身就是 AI 分析请求，结果存在 `strategyReport` 时在 DeepSeek 卡片之前展示：

```vue
<stock-strategy-report
  v-if="result.strategyReport"
  :report="result.strategyReport"
/>
```

缺失时展示兼容提示，不清除缓存结果。保持 K 线仍为整个结果区第一张卡。

- [ ] **Step 4: 接入自选页和持仓页**

自选页把共享报告放入现有 `aiShown[stockCode]` 区域并位于 AI 文本之前，不传 `show-exit-step`。持仓页放入现有 `aiShown[positionId]` 区域并传 `show-exit-step`；组件只消费后端 `exitStep`，前端不自行计算止盈止损。

普通“分析”仍只显示现有 K 线、行情和基础技术信号；只有点击 AI 分析并成功返回后设置 `aiShown=true`。即使 `aiAdvice` 是“未配置/调用失败”，只要请求是 AI 分析请求且 `strategyReport` 存在，也应把 `aiShown` 设为 true，不能继续用 `Boolean(aiAdvice)` 作为唯一条件。

- [ ] **Step 5: 运行前端相关测试并提交**

```powershell
npm run test:stock-strategy
npm run test:stock-session
npm run test:stock-list-kline
npm run test:stock-expand
npm run test:position-remove
git add -- tests/stock-strategy-report.test.js tests/stock-analyzer-session.test.js tests/watchlist-position-kline.test.js src/views/stock/analyzer/index.vue src/views/stock/watchlist/index.vue src/views/stock/position/index.vue
git commit -m "feat: show 520 report across stock pages"
```

### Task 9: 全量验证、代码审查和浏览器验收

**Files:**
- Verify only; 如发现缺陷，先补失败测试再修复，不在此任务中无依据扩大范围。

- [ ] **Step 1: 运行全部后端相关测试**

```powershell
mvn -pl ruoyi-system,ruoyi-admin -am -Dtest=StockAnalyzerServiceImplTest,StockStrategyReportEvaluatorTest,StockPositionAnalysisSnapshotServiceImplTest,StockPositionServiceImplTest,StockWatchlistServiceImplTest -Dsurefire.failIfNoSpecifiedTests=false test
```

Expected: 全部通过；没有访问真实外部行情或 DeepSeek 的测试。

- [ ] **Step 2: 运行全部股票前端合同**

Run from `ruoyi-ui`:

```powershell
npm run test:stock-kline
npm run test:stock-list-kline
npm run test:stock-session
npm run test:stock-expand
npm run test:position-remove
npm run test:stock-strategy
```

Expected: 六个命令全部 exit 0。

- [ ] **Step 3: 运行生产构建**

```powershell
npm run build:prod
```

Expected: `Build complete`；已有 bundle-size warning 可记录，新编译错误不可接受。

- [ ] **Step 4: 检查 diff 和用户文件保护**

Run from repository root:

```powershell
git diff --check
git status --short
git log --oneline --decorate -10
```

确认用户原有的 `ruoyi-admin/src/main/resources/application.yml`、`doc/520均线战法_所需指标清单.csv` 和 `docs/superpowers/plans/2026-07-21-watchlist.md` 没有被暂存或改写。

- [ ] **Step 5: 进行实现后代码审查**

使用 `superpowers:requesting-code-review` 审查设计逐项覆盖、重复规则、空值/除零、持仓隔离和前端展示时机。对发现的问题按“失败测试 -> 最小修复 -> 回归测试”处理。

- [ ] **Step 6: 在当前浏览器做端到端验收**

使用 `browser:control-in-app-browser` 打开当前本地站点并验证：

1. AI 分析页 K 线仍在最顶部，MA5 黑、MA10 黄、MA20 红，图例圆点和折线一致。
2. 报告严格按“数据证据 -> 结论/原因”展示；趋势走平/向下时三类买点仍可见并显示“已跳过”。
3. 自选页普通分析不显示三步走，点击 AI 分析后显示趋势、三类买点和仓位建议，但没有止损止盈。
4. 持仓页普通分析不显示三步走，点击 AI 分析后额外显示短线止损、趋势止损、常规止盈、强势止盈。
5. DeepSeek 未配置或模拟失败时，确定性三步走报告仍完整可见，AI 区显示不可用原因。
6. 切换页面再返回时，分析页会话和持仓快照仍能恢复；旧缓存/旧快照没有 `strategyReport` 时保留旧内容并提示重新 AI 分析。
7. 窄屏没有横向溢出，状态文字不依赖颜色才能理解。

如登录、验证码或服务未启动阻塞验收，记录具体阻塞点；不得绕过认证，也不得把仅单元测试通过描述成运行时已验证。

- [ ] **Step 7: 最终完成性检查**

逐条对照 `docs/superpowers/specs/2026-07-30-520-three-step-strategy-report-design.md`，为每个需求标记测试、构建、diff 或浏览器证据。只有代码审查问题已关闭且所有必需验证通过后，才使用 `superpowers:finishing-a-development-branch` 进入合并/保留分支选择。
