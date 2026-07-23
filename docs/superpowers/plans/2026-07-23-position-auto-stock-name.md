# Position Auto Stock Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the stock-name field from the add-position dialog and resolve a trusted stock name from Tencent quotes before persisting a new position.

**Architecture:** Expose a lightweight `resolveStockName` operation from the existing analyzer service, backed only by its Tencent real-time quote request. The position controller overwrites any client-supplied name with the resolved value before invoking the existing position service; the frontend submits only code, cost, and quantity.

**Tech Stack:** Java 17, Spring Boot, JUnit 5, Vue 2.6, Element UI 2.15

---

### Task 1: Add tested Tencent quote parsing and name resolution

**Files:**
- Modify: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java`
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/service/IStockAnalyzerService.java`
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java`

- [ ] **Step 1: Write failing parser tests**

Add tests proving a valid Tencent payload returns a populated stock and an invalid payload returns `null`:

```java
@Test
void parsesStockNameFromTencentRealtimePayload()
{
    String[] fields = new String[45];
    Arrays.fill(fields, "");
    fields[1] = "贵州茅台";
    fields[3] = "1500.00";
    fields[4] = "1490.00";
    fields[5] = "1495.00";
    fields[30] = "20260723";
    fields[31] = "150000";
    fields[33] = "1510.00";
    fields[34] = "1488.00";
    fields[36] = "12345";
    fields[37] = "185000000";

    StockAnalyzerServiceImpl service = new StockAnalyzerServiceImpl();
    StockRealtimeData stock = service.parseTencentResponse(
        "sh600519", "v_sh600519=\"" + String.join("~", fields) + "\";"
    );

    assertNotNull(stock);
    assertEquals("贵州茅台", stock.getName());
    assertEquals("sh600519", stock.getCode());
}

@Test
void rejectsInvalidTencentRealtimePayload()
{
    StockAnalyzerServiceImpl service = new StockAnalyzerServiceImpl();
    assertNull(service.parseTencentResponse("sh600519", "v_sh600519=\"\";"));
}
```

- [ ] **Step 2: Run the target test and verify RED**

Run:

```powershell
mvn -pl ruoyi-system -am -Dtest=StockAnalyzerServiceImplTest -Dsurefire.failIfNoSpecifiedTests=false test
```

Expected: compilation failure because `parseTencentResponse` does not exist.

- [ ] **Step 3: Extract the parser and expose name resolution**

Add to `IStockAnalyzerService`:

```java
String resolveStockName(String stockCode);
```

In `StockAnalyzerServiceImpl`, move the Tencent response parsing from `fetchRealtimeData` into:

```java
StockRealtimeData parseTencentResponse(String code, String text)
{
    if (!StringUtils.hasText(text) || !text.contains("=\"")) return null;
    String dataStr = text.split("=\"", 2)[1].replace("\";", "").replace("\"", "");
    String[] fields = dataStr.split("~", -1);
    if (fields.length < 45 || !StringUtils.hasText(fields[1])) return null;

    StockRealtimeData stock = new StockRealtimeData();
    stock.setCode(code);
    stock.setName(fields[1]);
    stock.setCurrentPrice(parseDouble(fields[3]));
    stock.setPrevClose(parseDouble(fields[4]));
    stock.setOpenPrice(parseDouble(fields[5]));
    stock.setHigh(parseDouble(fields[33]));
    stock.setLow(parseDouble(fields[34]));
    stock.setVolume(parseLong(fields[36]));
    stock.setAmount(parseDouble(fields[37]));
    stock.setDate(fields[30]);
    stock.setTime(fields[31]);
    return stock;
}
```

Update `fetchRealtimeData` to call this parser. Implement:

```java
@Override
public String resolveStockName(String stockCode)
{
    StockRealtimeData stock = fetchRealtimeData(normalizeCode(stockCode));
    if (stock == null || !StringUtils.hasText(stock.getName()))
    {
        throw new ServiceException("无法识别股票代码，请检查后重试");
    }
    return stock.getName();
}
```

Import `com.ruoyi.common.exception.ServiceException`.

- [ ] **Step 4: Run the target test and verify GREEN**

Run the same Maven command.

Expected: `Tests run: 3, Failures: 0, Errors: 0`.

- [ ] **Step 5: Commit the analyzer service change**

```powershell
git add -- `
  'ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImplTest.java' `
  'ruoyi-system/src/main/java/com/ruoyi/system/service/IStockAnalyzerService.java' `
  'ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockAnalyzerServiceImpl.java'
git commit -m "feat: resolve stock name from realtime quote"
```

### Task 2: Resolve and overwrite the name during position creation

**Files:**
- Modify: `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java`

- [ ] **Step 1: Add a failing source-contract check**

Run:

```powershell
$source = Get-Content -Raw 'ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java'
if ($source -notmatch 'setStockName\\(analyzer\\.resolveStockName\\(p\\.getStockCode\\(\\)\\)\\)') { throw 'Controller does not resolve the stock name' }
```

Expected: command throws `Controller does not resolve the stock name`.

- [ ] **Step 2: Resolve the name before persistence**

Expand the existing add method to:

```java
@PreAuthorize("@ss.hasPermi('stock:position:add')")
@PostMapping
public AjaxResult add(@RequestBody StockPosition p)
{
    p.setStockName(analyzer.resolveStockName(p.getStockCode()));
    service.add(getUserId(), p, getUsername());
    return success();
}
```

This deliberately overwrites a client-supplied value.

- [ ] **Step 3: Re-run the source-contract check**

Run the same PowerShell check.

Expected: command exits successfully.

- [ ] **Step 4: Run backend module tests**

Run:

```powershell
mvn -pl ruoyi-admin -am -DskipTests=false test
```

Expected: Maven exits with code `0`.

- [ ] **Step 5: Commit the controller change**

```powershell
git add -- 'ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java'
git commit -m "feat: populate position stock name on create"
```

### Task 3: Remove stock name from the add-position dialog

**Files:**
- Modify: `ruoyi-ui/src/views/stock/position/index.vue`

- [ ] **Step 1: Record the failing UI contract**

Run:

```powershell
$source = Get-Content -Raw 'ruoyi-ui/src/views/stock/position/index.vue'
if ($source -match 'addForm\\.stockName') { throw 'Add dialog still accepts stock name' }
```

Expected: command throws `Add dialog still accepts stock name`.

- [ ] **Step 2: Remove the field and payload state**

Delete the add-dialog form item bound to `addForm.stockName`.

Change:

```js
this.addForm = { stockCode: '', stockName: '', costPrice: null, quantity: null }
```

to:

```js
this.addForm = { stockCode: '', costPrice: null, quantity: null }
```

Keep the existing validation message for code, cost, and quantity. Do not change edit-position behavior.

- [ ] **Step 3: Re-run the UI contract**

Run the same PowerShell check.

Expected: command exits successfully.

- [ ] **Step 4: Run the production frontend build**

Run:

```powershell
npm run build:prod
```

Working directory: `ruoyi-ui`.

Expected: exit code `0` and `Build complete`.

- [ ] **Step 5: Commit the frontend change**

```powershell
git add -- 'ruoyi-ui/src/views/stock/position/index.vue'
git commit -m "style: simplify add position dialog"
```

### Task 4: Final verification

**Files:**
- Verify all files changed in Tasks 1–3.

- [ ] **Step 1: Run focused backend tests**

```powershell
mvn -pl ruoyi-system -am -Dtest=StockAnalyzerServiceImplTest,StockPositionServiceImplTest -Dsurefire.failIfNoSpecifiedTests=false test
```

Expected: Maven exits with code `0`.

- [ ] **Step 2: Run frontend production build**

```powershell
npm run build:prod
```

Working directory: `ruoyi-ui`.

Expected: exit code `0`.

- [ ] **Step 3: Verify final contracts and change scope**

```powershell
rg -n "resolveStockName|setStockName" ruoyi-system ruoyi-admin
rg -n "addForm\\.stockName" ruoyi-ui/src/views/stock/position/index.vue
git diff --check
git status --short
```

Expected: resolver and controller assignment are present; `addForm.stockName` has no matches; no whitespace errors; unrelated user changes remain untouched.
