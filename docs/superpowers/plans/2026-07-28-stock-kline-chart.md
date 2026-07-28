# 股票分析页三个月 K 线图实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点击股票分析后，在结果最上方展示最近 60 个交易日的日 K、MA5/MA10/MA20 和联动成交量，并在同一浏览器会话内恢复最近一次分析结果。

**Architecture:** 扩展现有 `/stock/analyzer/analyze` 响应，由后端使用完整历史数据计算均线后返回最后 60 条强类型 K 线。前端用独立 ECharts 组件渲染一体式双网格图表，并用两个可单测的纯工具模块分别构造图表配置和管理 `sessionStorage`。

**Tech Stack:** Java 17、Spring Boot、JUnit 5、Vue 2.6、Element UI 2.15、ECharts 5.4、Node `assert` 合约测试、SCSS。

---

## 文件结构

- 新建 `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockKlineData.java`：单条图表 K 线的强类型 DTO。
- 修改 `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisResult.java`：在分析响应中暴露 `klineData`。
- 修改 `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java`：过滤、计算三条均线、截取并装配最近 60 个交易日。
- 修改 `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java`：覆盖截取、均线、映射和非法数据。
- 新建 `ruoyi-ui/src/utils/stock-kline.js`：纯函数构造 ECharts option 与格式化提示内容。
- 新建 `ruoyi-ui/src/utils/stock-analyzer-session.js`：读写和校验当前标签页的分析缓存。
- 新建 `ruoyi-ui/src/views/stock/analyzer/components/StockKlineChart.vue`：管理 ECharts 生命周期和空状态。
- 修改 `ruoyi-ui/src/views/stock/analyzer/index.vue`：把图表放到结果首位，并接入会话恢复。
- 新建 `ruoyi-ui/tests/stock-kline-chart.test.js`：测试图表数据转换及组件合约。
- 新建 `ruoyi-ui/tests/stock-analyzer-session.test.js`：测试缓存保存、恢复和损坏数据降级。
- 修改 `ruoyi-ui/package.json`：增加两个前端测试脚本。

## Task 1：定义并生成后端 K 线响应

**Files:**
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockKlineData.java`
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisResult.java`
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java`
- Test: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java`

- [ ] **Step 1: 先写 60 条截取和完整历史均线测试**

在 `StockAnalyzerServiceImplTest` 增加以下测试和辅助方法：

```java
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import com.alibaba.fastjson2.JSONObject;
import com.ruoyi.system.domain.stock.StockKlineData;

@Test
void buildsLastSixtyKlinesWithMovingAveragesFromFullHistory()
{
    StockAnalyzerServiceImpl service = new StockAnalyzerServiceImpl();
    List<JSONObject> bars = new ArrayList<>();
    for (int day = 1; day <= 80; day++)
    {
        JSONObject bar = new JSONObject();
        bar.put("day", LocalDate.of(2026, 1, 1).plusDays(day - 1L).toString());
        bar.put("open", String.valueOf(day - 0.5));
        bar.put("close", String.valueOf(day));
        bar.put("high", String.valueOf(day + 1));
        bar.put("low", String.valueOf(day - 1));
        bar.put("volume", String.valueOf(day * 1000L));
        bars.add(bar);
    }
    Collections.reverse(bars);

    List<StockKlineData> result = service.buildKlineChartData(bars);

    assertEquals(60, result.size());
    StockKlineData first = result.get(0);
    assertEquals("2026-01-21", first.getDate());
    assertEquals(20.5, first.getOpen());
    assertEquals(21.0, first.getClose());
    assertEquals(22.0, first.getHigh());
    assertEquals(20.0, first.getLow());
    assertEquals(21000L, first.getVolume());
    assertEquals(19.0, first.getMa5());
    assertEquals(16.5, first.getMa10());
    assertEquals(11.5, first.getMa20());
    assertEquals("2026-03-21", result.get(59).getDate());
}

@Test
void filtersKlineRowsWithoutValidDateOrOhlc()
{
    StockAnalyzerServiceImpl service = new StockAnalyzerServiceImpl();
    List<JSONObject> bars = new ArrayList<>();
    JSONObject valid = new JSONObject();
    valid.put("day", "2026-07-28");
    valid.put("open", "10.0");
    valid.put("close", "10.5");
    valid.put("high", "10.8");
    valid.put("low", "9.9");
    valid.put("volume", "invalid");
    bars.add(valid);
    JSONObject invalid = new JSONObject();
    invalid.put("day", "");
    invalid.put("open", "bad");
    bars.add(invalid);

    List<StockKlineData> result = service.buildKlineChartData(bars);

    assertEquals(1, result.size());
    assertEquals(0L, result.get(0).getVolume());
    assertNull(result.get(0).getMa5());
}
```

- [ ] **Step 2: 运行测试并确认 RED**

Run:

```powershell
mvn -pl ruoyi-system -am "-Dtest=StockAnalyzerServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

Expected: 编译失败，提示 `StockKlineData` 和 `buildKlineChartData` 尚不存在。

- [ ] **Step 3: 新增强类型 DTO**

创建 `StockKlineData.java`：

```java
package com.ruoyi.system.domain.stock;

public class StockKlineData
{
    private String date;
    private Double open;
    private Double close;
    private Double high;
    private Double low;
    private long volume;
    private Double ma5;
    private Double ma10;
    private Double ma20;

    public String getDate() { return date; }
    public void setDate(String date) { this.date = date; }
    public Double getOpen() { return open; }
    public void setOpen(Double open) { this.open = open; }
    public Double getClose() { return close; }
    public void setClose(Double close) { this.close = close; }
    public Double getHigh() { return high; }
    public void setHigh(Double high) { this.high = high; }
    public Double getLow() { return low; }
    public void setLow(Double low) { this.low = low; }
    public long getVolume() { return volume; }
    public void setVolume(long volume) { this.volume = volume; }
    public Double getMa5() { return ma5; }
    public void setMa5(Double ma5) { this.ma5 = ma5; }
    public Double getMa10() { return ma10; }
    public void setMa10(Double ma10) { this.ma10 = ma10; }
    public Double getMa20() { return ma20; }
    public void setMa20(Double ma20) { this.ma20 = ma20; }
}
```

- [ ] **Step 4: 在分析结果中增加列表字段**

在 `StockAnalysisResult` 增加字段、getter 和 setter：

```java
private java.util.List<StockKlineData> klineData;

public java.util.List<StockKlineData> getKlineData() { return klineData; }
public void setKlineData(java.util.List<StockKlineData> klineData) { this.klineData = klineData; }
```

- [ ] **Step 5: 实现 K 线过滤、均线和截取**

在 `StockAnalyzerServiceImpl` 导入 `StockKlineData` 和 `java.util.Comparator`，增加常量和包级方法。新浪当前字段为 `day/open/close/high/low/volume`；同时兼容既有代码使用的 `d/o/c/h/l/v` 简写：

```java
private static final int KLINE_DISPLAY_DAYS = 60;

List<StockKlineData> buildKlineChartData(List<JSONObject> bars)
{
    List<JSONObject> valid = new ArrayList<>();
    for (JSONObject bar : bars)
    {
        String date = firstText(bar, "day", "d");
        Double open = firstDouble(bar, "open", "o");
        Double close = firstDouble(bar, "close", "c");
        Double high = firstDouble(bar, "high", "h");
        Double low = firstDouble(bar, "low", "l");
        if (StringUtils.hasText(date) && open != null && close != null && high != null && low != null)
        {
            valid.add(bar);
        }
    }
    valid.sort(Comparator.comparing(bar -> firstText(bar, "day", "d")));

    List<Double> closes = new ArrayList<>();
    for (JSONObject bar : valid) closes.add(firstDouble(bar, "close", "c"));
    List<Double> ma5 = calcMA(closes, 5);
    List<Double> ma10 = calcMA(closes, 10);
    List<Double> ma20 = calcMA(closes, 20);
    int start = Math.max(0, valid.size() - KLINE_DISPLAY_DAYS);
    List<StockKlineData> result = new ArrayList<>();

    for (int i = start; i < valid.size(); i++)
    {
        JSONObject bar = valid.get(i);
        StockKlineData item = new StockKlineData();
        item.setDate(firstText(bar, "day", "d"));
        item.setOpen(firstDouble(bar, "open", "o"));
        item.setClose(firstDouble(bar, "close", "c"));
        item.setHigh(firstDouble(bar, "high", "h"));
        item.setLow(firstDouble(bar, "low", "l"));
        item.setVolume(firstLong(bar, "volume", "v"));
        item.setMa5(ma5.get(i));
        item.setMa10(ma10.get(i));
        item.setMa20(ma20.get(i));
        result.add(item);
    }
    return result;
}

private String firstText(JSONObject bar, String longKey, String shortKey)
{
    String value = bar.getString(longKey);
    return StringUtils.hasText(value) ? value : bar.getString(shortKey);
}

private Double firstDouble(JSONObject bar, String longKey, String shortKey)
{
    String value = firstText(bar, longKey, shortKey);
    try { return StringUtils.hasText(value) ? Double.valueOf(value) : null; }
    catch (NumberFormatException e) { return null; }
}

private long firstLong(JSONObject bar, String longKey, String shortKey)
{
    String value = firstText(bar, longKey, shortKey);
    try { return StringUtils.hasText(value) ? Long.parseLong(value) : 0L; }
    catch (NumberFormatException e) { return 0L; }
}
```

在 `analyze` 装配结果处加入：

```java
result.setKlineData(buildKlineChartData(klineData));
```

- [ ] **Step 6: 运行后端测试并确认 GREEN**

Run:

```powershell
mvn -pl ruoyi-system -am "-Dtest=StockAnalyzerServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

Expected: `StockAnalyzerServiceImplTest` 全部通过，构建输出为 `BUILD SUCCESS`。

- [ ] **Step 7: 提交后端改动**

```powershell
git add -- ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockKlineData.java ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisResult.java ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java
git commit -m "feat: expose three month stock kline data"
```

## Task 2：用纯函数定义图表数据和联动配置

**Files:**
- Create: `ruoyi-ui/src/utils/stock-kline.js`
- Create: `ruoyi-ui/tests/stock-kline-chart.test.js`
- Modify: `ruoyi-ui/package.json`

- [ ] **Step 1: 写图表 option 的失败测试**

创建 `stock-kline-chart.test.js`，先只测试纯函数：

```javascript
const assert = require('assert')
const { buildStockKlineOption, formatKlineTooltip } = require('../src/utils/stock-kline')

const bars = [
  { date: '2026-07-27', open: 10, close: 11, high: 12, low: 9, volume: 1000, ma5: 10.1, ma10: 9.9, ma20: 9.5 },
  { date: '2026-07-28', open: 11, close: 10, high: 11.5, low: 9.5, volume: 800, ma5: 10.2, ma10: 10, ma20: 9.6 }
]

const option = buildStockKlineOption(bars)
assert.deepStrictEqual(option.xAxis[0].data, ['2026-07-27', '2026-07-28'])
assert.deepStrictEqual(option.series[0].data, [[10, 11, 9, 12], [11, 10, 9.5, 11.5]])
assert.deepStrictEqual(option.series[1].data, [10.1, 10.2])
assert.deepStrictEqual(option.series[2].data, [9.9, 10])
assert.deepStrictEqual(option.series[3].data, [9.5, 9.6])
assert.strictEqual(option.series[4].data[0].itemStyle.color, '#E5484D')
assert.strictEqual(option.series[4].data[1].itemStyle.color, '#16A36A')
assert.deepStrictEqual(option.axisPointer.link, [{ xAxisIndex: 'all' }])
assert.deepStrictEqual(option.dataZoom[0].xAxisIndex, [0, 1])
assert.deepStrictEqual(option.dataZoom[1].xAxisIndex, [0, 1])
assert(formatKlineTooltip(bars, 0).includes('涨跌幅：--'))
assert(formatKlineTooltip(bars, 1).includes('涨跌幅：-9.09%'))
assert(formatKlineTooltip(bars, 1).includes('MA20：9.60'))
console.log('stock kline chart option tests passed')
```

在 `package.json` 的 `scripts` 增加：

```json
"test:stock-kline": "node tests/stock-kline-chart.test.js"
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npm --prefix ruoyi-ui run test:stock-kline`

Expected: FAIL，提示找不到 `src/utils/stock-kline`。

- [ ] **Step 3: 实现最小图表 option 构造器**

创建 `stock-kline.js`，导出 CommonJS 纯函数，以便 Vue 和 Node 测试共同使用：

```javascript
const UP_COLOR = '#E5484D'
const DOWN_COLOR = '#16A36A'

function safeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function formatPrice(value) {
  const number = safeNumber(value)
  return number === null ? '--' : number.toFixed(2)
}

function formatKlineTooltip(bars, index) {
  const bar = bars[index]
  if (!bar) return ''
  const previous = index > 0 ? bars[index - 1] : null
  const previousClose = previous && safeNumber(previous.close)
  const close = safeNumber(bar.close)
  const changePct = previousClose && close !== null
    ? `${((close - previousClose) / previousClose * 100).toFixed(2)}%`
    : '--'
  return [
    `<strong>${bar.date || '--'}</strong>`,
    `开盘：${formatPrice(bar.open)}`,
    `最高：${formatPrice(bar.high)}`,
    `最低：${formatPrice(bar.low)}`,
    `收盘：${formatPrice(bar.close)}`,
    `涨跌幅：${changePct}`,
    `成交量：${safeNumber(bar.volume) === null ? '--' : Number(bar.volume).toLocaleString()}`,
    `MA5：${formatPrice(bar.ma5)}`,
    `MA10：${formatPrice(bar.ma10)}`,
    `MA20：${formatPrice(bar.ma20)}`
  ].join('<br>')
}

function buildStockKlineOption(klineData) {
  const bars = Array.isArray(klineData) ? klineData : []
  const dates = bars.map(item => item.date)
  const candleData = bars.map(item => [item.open, item.close, item.low, item.high].map(safeNumber))
  const line = key => bars.map(item => safeNumber(item[key]))
  const volumes = bars.map(item => ({
    value: safeNumber(item.volume) || 0,
    itemStyle: { color: Number(item.close) >= Number(item.open) ? UP_COLOR : DOWN_COLOR }
  }))

  return {
    animation: false,
    legend: { top: 8, data: ['MA5', 'MA10', 'MA20'] },
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter(params) {
        const candle = params.find(item => item.seriesType === 'candlestick')
        const index = candle ? candle.dataIndex : (params[0] ? params[0].dataIndex : -1)
        return formatKlineTooltip(bars, index)
      }
    },
    grid: [
      { left: 64, right: 28, top: 50, height: '58%' },
      { left: 64, right: 28, top: '76%', height: '14%' }
    ],
    xAxis: [
      { type: 'category', data: dates, boundaryGap: true, axisLine: { onZero: false }, min: 'dataMin', max: 'dataMax' },
      { type: 'category', gridIndex: 1, data: dates, boundaryGap: true, axisLabel: { show: false } }
    ],
    yAxis: [
      { scale: true, splitArea: { show: true } },
      { scale: true, gridIndex: 1, splitNumber: 2 }
    ],
    dataZoom: [
      { type: 'inside', xAxisIndex: [0, 1], start: 0, end: 100 },
      { type: 'slider', xAxisIndex: [0, 1], bottom: 8, start: 0, end: 100 }
    ],
    series: [
      { name: '日K', type: 'candlestick', data: candleData, itemStyle: { color: UP_COLOR, color0: DOWN_COLOR, borderColor: UP_COLOR, borderColor0: DOWN_COLOR } },
      { name: 'MA5', type: 'line', data: line('ma5'), smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#F59E0B' } },
      { name: 'MA10', type: 'line', data: line('ma10'), smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#8B5CF6' } },
      { name: 'MA20', type: 'line', data: line('ma20'), smooth: true, showSymbol: false, lineStyle: { width: 1.5, color: '#2563EB' } },
      { name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: volumes }
    ]
  }
}

module.exports = { buildStockKlineOption, formatKlineTooltip }
```

- [ ] **Step 4: 运行测试并确认 GREEN**

Run: `npm --prefix ruoyi-ui run test:stock-kline`

Expected: 输出 `stock kline chart option tests passed`，退出码为 0。

- [ ] **Step 5: 提交图表纯函数**

```powershell
git add -- ruoyi-ui/src/utils/stock-kline.js ruoyi-ui/tests/stock-kline-chart.test.js ruoyi-ui/package.json
git commit -m "test: define stock kline chart options"
```

## Task 3：实现 ECharts K 线组件

**Files:**
- Create: `ruoyi-ui/src/views/stock/analyzer/components/StockKlineChart.vue`
- Modify: `ruoyi-ui/tests/stock-kline-chart.test.js`

- [ ] **Step 1: 先增加组件生命周期和空状态合约测试**

在 `stock-kline-chart.test.js` 读取组件源码并增加断言：

```javascript
const fs = require('fs')
const path = require('path')
const component = fs.readFileSync(
  path.resolve(__dirname, '../src/views/stock/analyzer/components/StockKlineChart.vue'),
  'utf8'
)
assert(component.includes("import * as echarts from 'echarts'"))
assert(component.includes('buildStockKlineOption(this.klineData)'))
assert(component.includes("window.addEventListener('resize', this.resizeChart)"))
assert(component.includes("window.removeEventListener('resize', this.resizeChart)"))
assert(component.includes('this.chart.dispose()'))
assert(component.includes('暂无 K 线数据'))
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npm --prefix ruoyi-ui run test:stock-kline`

Expected: FAIL，提示 `StockKlineChart.vue` 不存在。

- [ ] **Step 3: 创建独立图表组件**

组件必须包含以下结构和生命周期，不在组件内请求数据或访问缓存：

```vue
<template>
  <el-card class="stock-card kline-card" shadow="never">
    <div slot="header" class="stock-card__header">
      <div>
        <h2 class="stock-card__title">近三个月日 K</h2>
        <p class="stock-card__description">日 K、MA5 / MA10 / MA20 与成交量</p>
      </div>
      <div class="kline-meta">
        <span class="stock-badge">{{ klineData.length }} 个交易日</span>
        <small v-if="updatedAt">更新时间 {{ updatedAt }}</small>
      </div>
    </div>
    <div v-if="klineData.length" ref="chart" class="kline-chart" />
    <div v-else class="kline-empty">暂无 K 线数据</div>
  </el-card>
</template>

<script>
import * as echarts from 'echarts'
import { buildStockKlineOption } from '@/utils/stock-kline'

export default {
  name: 'StockKlineChart',
  props: {
    klineData: { type: Array, default: () => [] },
    updatedAt: { type: String, default: '' }
  },
  data() { return { chart: null } },
  watch: {
    klineData: {
      deep: true,
      handler() { this.$nextTick(this.renderChart) }
    }
  },
  mounted() {
    this.$nextTick(this.renderChart)
    window.addEventListener('resize', this.resizeChart)
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.resizeChart)
    if (this.chart) {
      this.chart.dispose()
      this.chart = null
    }
  },
  methods: {
    renderChart() {
      if (!this.klineData.length || !this.$refs.chart) return
      if (!this.chart) this.chart = echarts.init(this.$refs.chart)
      this.chart.setOption(buildStockKlineOption(this.klineData), true)
    },
    resizeChart() {
      if (this.chart) this.chart.resize()
    }
  }
}
</script>
```

样式要求：桌面端 `.kline-chart { height: 520px; }`，`max-width: 768px` 时为 `420px`；空状态最小高度 `240px` 并居中；`.kline-meta` 右对齐且窄屏允许换行。

- [ ] **Step 4: 运行图表测试并确认 GREEN**

Run: `npm --prefix ruoyi-ui run test:stock-kline`

Expected: 图表 option 与组件合约全部通过。

- [ ] **Step 5: 提交组件**

```powershell
git add -- ruoyi-ui/src/views/stock/analyzer/components/StockKlineChart.vue ruoyi-ui/tests/stock-kline-chart.test.js
git commit -m "feat: add stock kline chart component"
```

## Task 4：实现会话缓存工具

**Files:**
- Create: `ruoyi-ui/src/utils/stock-analyzer-session.js`
- Create: `ruoyi-ui/tests/stock-analyzer-session.test.js`
- Modify: `ruoyi-ui/package.json`

- [ ] **Step 1: 写保存、恢复和异常降级测试**

创建 `stock-analyzer-session.test.js`：

```javascript
const assert = require('assert')
const {
  STOCK_ANALYZER_SESSION_KEY,
  saveAnalysisSession,
  loadAnalysisSession
} = require('../src/utils/stock-analyzer-session')

function memoryStorage() {
  const values = {}
  return {
    getItem: key => values[key] || null,
    setItem: (key, value) => { values[key] = value }
  }
}

const storage = memoryStorage()
const result = { stock: { code: 'sh600519' }, klineData: [{ date: '2026-07-28' }] }
assert.strictEqual(saveAnalysisSession(storage, '600519', result, 123456), true)
assert.deepStrictEqual(loadAnalysisSession(storage), { stockCode: '600519', result, savedAt: 123456 })
storage.setItem(STOCK_ANALYZER_SESSION_KEY, '{bad json')
assert.strictEqual(loadAnalysisSession(storage), null)
assert.strictEqual(loadAnalysisSession({ getItem() { throw new Error('disabled') } }), null)
assert.strictEqual(saveAnalysisSession({ setItem() { throw new Error('full') } }, '600519', result, 1), false)
console.log('stock analyzer session tests passed')
```

在 `package.json` 增加：

```json
"test:stock-session": "node tests/stock-analyzer-session.test.js"
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `npm --prefix ruoyi-ui run test:stock-session`

Expected: FAIL，提示找不到 `stock-analyzer-session`。

- [ ] **Step 3: 实现可降级的会话缓存**

创建 `stock-analyzer-session.js`：

```javascript
const STOCK_ANALYZER_SESSION_KEY = 'stock-analyzer:last-result'

function saveAnalysisSession(storage, stockCode, result, savedAt = Date.now()) {
  try {
    storage.setItem(STOCK_ANALYZER_SESSION_KEY, JSON.stringify({ stockCode, result, savedAt }))
    return true
  } catch (error) {
    return false
  }
}

function loadAnalysisSession(storage) {
  try {
    const raw = storage.getItem(STOCK_ANALYZER_SESSION_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw)
    if (!cached || typeof cached.stockCode !== 'string' || !cached.result || !cached.result.stock || !Number.isFinite(cached.savedAt)) return null
    return cached
  } catch (error) {
    return null
  }
}

module.exports = { STOCK_ANALYZER_SESSION_KEY, saveAnalysisSession, loadAnalysisSession }
```

- [ ] **Step 4: 运行缓存测试并确认 GREEN**

Run: `npm --prefix ruoyi-ui run test:stock-session`

Expected: 输出 `stock analyzer session tests passed`，退出码为 0。

- [ ] **Step 5: 提交缓存工具**

```powershell
git add -- ruoyi-ui/src/utils/stock-analyzer-session.js ruoyi-ui/tests/stock-analyzer-session.test.js ruoyi-ui/package.json
git commit -m "feat: persist stock analysis in browser session"
```

## Task 5：把图表和会话恢复接入分析页

**Files:**
- Modify: `ruoyi-ui/src/views/stock/analyzer/index.vue`
- Modify: `ruoyi-ui/tests/stock-kline-chart.test.js`
- Modify: `ruoyi-ui/tests/stock-analyzer-session.test.js`

- [ ] **Step 1: 写页面集成的失败合约测试**

在两个前端测试中读取 `index.vue`，断言：

```javascript
const analyzer = fs.readFileSync(
  path.resolve(__dirname, '../src/views/stock/analyzer/index.vue'),
  'utf8'
)
const chartPosition = analyzer.indexOf('<stock-kline-chart')
const quotePosition = analyzer.indexOf('class="stock-card quote-card"')
assert(chartPosition > -1 && chartPosition < quotePosition, 'K line chart must be the first result card')
assert(analyzer.includes("import StockKlineChart from './components/StockKlineChart.vue'"))
assert(analyzer.includes('saveAnalysisSession(window.sessionStorage'))
assert(analyzer.includes('loadAnalysisSession(window.sessionStorage)'))
assert(analyzer.includes('this.resultSavedAt = cached.savedAt'))
```

- [ ] **Step 2: 运行两个测试并确认 RED**

Run:

```powershell
npm --prefix ruoyi-ui run test:stock-kline
npm --prefix ruoyi-ui run test:stock-session
```

Expected: 页面尚未引入组件和缓存函数，因此集成断言失败。

- [ ] **Step 3: 把图表插入结果区第一位**

在 `<template v-if="result && result.stock && !loading">` 后、行情卡片前加入：

```vue
<stock-kline-chart
  :kline-data="result.klineData || []"
  :updated-at="formattedResultSavedAt"
/>
```

在脚本顶部导入并注册：

```javascript
import StockKlineChart from './components/StockKlineChart.vue'
import { saveAnalysisSession, loadAnalysisSession } from '@/utils/stock-analyzer-session'

components: { StockKlineChart },
```

- [ ] **Step 4: 实现恢复、保存和更新时间**

在 `data` 增加 `resultSavedAt: null`。在 `computed` 增加：

```javascript
formattedResultSavedAt() {
  if (!this.resultSavedAt) return ''
  return new Date(this.resultSavedAt).toLocaleString('zh-CN', { hour12: false })
}
```

在 `created` 最前面调用：

```javascript
this.restoreLastAnalysis()
```

增加方法：

```javascript
restoreLastAnalysis() {
  const cached = loadAnalysisSession(window.sessionStorage)
  if (!cached) return
  this.stockCode = cached.stockCode
  this.result = cached.result
  this.resultSavedAt = cached.savedAt
  this.buildMarketData()
}
```

在 `handleAnalyze` 请求成功回调内设置结果后加入：

```javascript
this.resultSavedAt = Date.now()
saveAnalysisSession(window.sessionStorage, code, this.result, this.resultSavedAt)
```

请求开始时现有 `this.result = null` 保留；不要删除 `sessionStorage` 中的上一次成功数据。路由带 `stockCode` 时仍按现有行为自动发起新分析并在成功后覆盖缓存。

- [ ] **Step 5: 运行前端测试并确认 GREEN**

Run:

```powershell
npm --prefix ruoyi-ui run test:stock-kline
npm --prefix ruoyi-ui run test:stock-session
npm --prefix ruoyi-ui run test:stock-expand
npm --prefix ruoyi-ui run test:position-remove
```

Expected: 四个脚本全部退出码为 0。

- [ ] **Step 6: 提交页面集成**

```powershell
git add -- ruoyi-ui/src/views/stock/analyzer/index.vue ruoyi-ui/tests/stock-kline-chart.test.js ruoyi-ui/tests/stock-analyzer-session.test.js
git commit -m "feat: show and restore analyzer kline chart"
```

## Task 6：执行完整验证并检查验收项

**Files:**
- Modify only if verification exposes a defect in files already listed above.

- [ ] **Step 1: 运行完整后端目标测试**

Run:

```powershell
mvn -pl ruoyi-system -am "-Dtest=StockAnalyzerServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

Expected: `BUILD SUCCESS`，0 failures，0 errors。

- [ ] **Step 2: 运行全部相关前端测试**

Run:

```powershell
npm --prefix ruoyi-ui run test:stock-kline
npm --prefix ruoyi-ui run test:stock-session
npm --prefix ruoyi-ui run test:stock-expand
npm --prefix ruoyi-ui run test:position-remove
```

Expected: 四个测试脚本全部成功，退出码均为 0。

- [ ] **Step 3: 执行前端生产构建**

Run: `npm --prefix ruoyi-ui run build:prod`

Expected: Vue/SCSS/ECharts 编译成功，命令退出码为 0；已有体积警告可记录，但不能出现编译错误。

- [ ] **Step 4: 检查变更范围和工作树**

Run:

```powershell
git diff --check
git status --short
```

Expected: `git diff --check` 无输出；只出现本计划产生的改动以及开始任务前就已存在的用户文件。不得提交或修改 `ruoyi-admin/src/main/resources/application.yml`、`doc/520均线战法_所需指标清单.csv`、`docs/superpowers/plans/2026-07-21-watchlist.md`。

- [ ] **Step 5: 人工浏览器验收**

启动前后端后依次验证：

1. 输入有效股票代码并点击分析，第一张结果卡片是“近三个月日 K”。
2. 图表有 60 根或不足上市历史时的全部日 K，包含 MA5、MA10、MA20 和成交量。
3. 十字光标、tooltip、滚轮缩放和底部滑块在 K 线与成交量区域同步。
4. 红涨绿跌与成交量颜色一致。
5. 切换到其他菜单再返回，结果仍在；同一标签页刷新后仍恢复并显示更新时间。
6. 再次分析另一只股票时，加载阶段不显示旧图，成功后缓存和图表一起替换。
7. 在约 768px 和 375px 宽度下无横向溢出或控件遮挡。

- [ ] **Step 6: 如验证阶段产生修复，重新运行相关测试后提交**

只暂存本功能文件，然后提交：

```powershell
git add -- ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockKlineData.java ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockAnalysisResult.java ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java ruoyi-ui/src/utils/stock-kline.js ruoyi-ui/src/utils/stock-analyzer-session.js ruoyi-ui/src/views/stock/analyzer/components/StockKlineChart.vue ruoyi-ui/src/views/stock/analyzer/index.vue ruoyi-ui/tests/stock-kline-chart.test.js ruoyi-ui/tests/stock-analyzer-session.test.js ruoyi-ui/package.json
git commit -m "fix: polish stock kline chart verification"
```

如果没有验证修复，不创建空提交。
