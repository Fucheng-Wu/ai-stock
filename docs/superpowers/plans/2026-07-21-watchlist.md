# 我的自选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, per-user watchlist below 股票管理, with add/list/delete and one-click analysis.

**Architecture:** Store watchlist rows in MySQL through a MyBatis mapper and a focused service. The controller obtains the user ID from `BaseController`; every mapper query is scoped by this ID. The Vue page calls those APIs and navigates to the existing analysis page using a stock-code query parameter.

**Tech Stack:** Java 17, Spring Boot/Security, MyBatis, MySQL, JUnit 5, Vue 2, Element UI.

---

## File structure

- Create `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockWatchlist.java`: entity extending `BaseEntity`.
- Create `ruoyi-system/src/main/java/com/ruoyi/system/mapper/stock/StockWatchlistMapper.java` and `ruoyi-system/src/main/resources/mapper/stock/StockWatchlistMapper.xml`: user-scoped persistence.
- Create `ruoyi-system/src/main/java/com/ruoyi/system/service/IStockWatchlistService.java` and `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockWatchlistServiceImpl.java`: validation and CRUD.
- Create `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockWatchlistController.java`: authenticated routes.
- Create `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockWatchlistServiceImplTest.java`: normalization, duplicate, and isolation coverage.
- Create `ruoyi-ui/src/api/stock/watchlist.js` and `ruoyi-ui/src/views/stock/watchlist/index.vue`: UI.
- Modify `ruoyi-ui/src/views/stock/analyzer/index.vue`: query-driven immediate analysis.
- Modify `sql/stock_menu.sql`: schema, index, menu, and permissions.

### Task 1: Test and implement stock-code normalization

**Files:** Create `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockWatchlistServiceImplTest.java`; create `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockWatchlistServiceImpl.java`.

- [ ] **Step 1: Write the failing tests.**

```java
@Test void normalizesCodes() {
  assertEquals("600519", service.normalizeStockCode(" sh600519 "));
  assertEquals("000001", service.normalizeStockCode("sz000001"));
}
@Test void rejectsUnsupportedCodes() {
  assertThrows(ServiceException.class, () -> service.normalizeStockCode("hk00700"));
  assertThrows(ServiceException.class, () -> service.normalizeStockCode("123"));
}
```

- [ ] **Step 2: Run `mvn -pl ruoyi-system -Dtest=StockWatchlistServiceImplTest test`.** Expected: compilation failure because the service is absent.
- [ ] **Step 3: Implement the minimum behavior.**

```java
public String normalizeStockCode(String input) {
  String code = StringUtils.trim(input).toLowerCase();
  if (code.startsWith("sh") || code.startsWith("sz")) code = code.substring(2);
  if (!code.matches("[036]\\d{5}")) throw new ServiceException("股票代码格式不正确，仅支持沪深 A 股");
  return code;
}
```

- [ ] **Step 4: Re-run the command.** Expected: 2 tests, 0 failures and 0 errors.
- [ ] **Step 5: Commit.** Run `git add ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockWatchlistServiceImpl.java ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockWatchlistServiceImplTest.java` then `git commit -m "feat: validate watchlist stock codes"`.

### Task 2: Add and test user-scoped persistence

**Files:** Create `StockWatchlist.java`, `StockWatchlistMapper.java`, `StockWatchlistMapper.xml`, and `IStockWatchlistService.java`; modify the service, test, and SQL script.

- [ ] **Step 1: Extend the failing test with user-scoped behaviors.**

```java
@Test void rejectsDuplicateForSameUser() {
  when(mapper.existsByUserIdAndCode(100L, "600519")).thenReturn(true);
  assertThrows(ServiceException.class, () -> service.add(100L, "600519", null, "admin"));
}
@Test void scopesDeleteToCurrentUser() {
  service.remove(100L, 9L);
  verify(mapper).deleteByIdAndUserId(9L, 100L);
}
```

- [ ] **Step 2: Run `mvn -pl ruoyi-system -Dtest=StockWatchlistServiceImplTest test`.** Expected: failure because mapper/entity/service CRUD API is missing.
- [ ] **Step 3: Define the entity and mapper contract.**

```java
public class StockWatchlist extends BaseEntity {
  private Long watchlistId; private Long userId; private String stockCode; private String stockName;
  // getters and setters
}
public interface StockWatchlistMapper {
  List<StockWatchlist> selectByUserId(Long userId);
  boolean existsByUserIdAndCode(@Param("userId") Long userId, @Param("stockCode") String stockCode);
  int insertWatchlist(StockWatchlist row);
  int deleteByIdAndUserId(@Param("watchlistId") Long id, @Param("userId") Long userId);
}
```

The XML `deleteByIdAndUserId` SQL must be `delete from stock_watchlist where watchlist_id = #{watchlistId} and user_id = #{userId}`; the select has the same user filter.
- [ ] **Step 4: Implement `list`, `add`, and `remove`.** `add` normalizes, checks `existsByUserIdAndCode`, sets `userId`, code, name, and `createBy`, then inserts. `remove` throws `ServiceException("自选股不存在")` when mapper deletion returns zero.
- [ ] **Step 5: Re-run the service test.** Expected: all tests pass.
- [ ] **Step 6: Add table and index to `sql/stock_menu.sql`.**

```sql
create table stock_watchlist (
  watchlist_id bigint(20) not null auto_increment, user_id bigint(20) not null,
  stock_code varchar(6) not null, stock_name varchar(50) default null,
  create_by varchar(64) default '', create_time datetime default null,
  update_by varchar(64) default '', update_time datetime default null,
  primary key (watchlist_id), unique key uk_stock_watchlist_user_code (user_id, stock_code)
) engine=InnoDB default charset=utf8mb4;
```

- [ ] **Step 7: Commit.** Stage the entity, mapper interface/XML, service interface/implementation, test, and SQL; commit `feat: persist user stock watchlists`.

### Task 3: Add authenticated REST endpoints

**Files:** Create `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockWatchlistController.java` and `ruoyi-admin/src/test/java/com/ruoyi/web/controller/stock/StockWatchlistControllerTest.java`.

- [ ] **Step 1: Write a failing controller test asserting that list, add, and delete delegate with the authenticated ID (not a request body ID).**

```java
@Test void deleteUsesAuthenticatedUserId() {
  controller.remove(9L);
  verify(service).remove(eq(100L), eq(9L));
}
@Test void addNeverUsesRequestUserId() {
  StockWatchlist body = new StockWatchlist();
  body.setUserId(999L); body.setStockCode("600519");
  controller.add(body);
  verify(service).add(eq(100L), eq("600519"), isNull(), eq("admin"));
}
```

Create a test-only controller subclass that overrides `getUserId()` to return `100L` and `getUsername()` to return `"admin"`; inject a Mockito `IStockWatchlistService` through `ReflectionTestUtils`.
- [ ] **Step 2: Run `mvn -pl ruoyi-admin -am -Dtest=StockWatchlistControllerTest test`.** Expected: failure because controller does not exist.
- [ ] **Step 3: Implement the routes.**

```java
@PreAuthorize("@ss.hasPermi('stock:watchlist:list')")
@GetMapping("/list") public AjaxResult list() { return success(service.list(getUserId())); }
@PreAuthorize("@ss.hasPermi('stock:watchlist:add')")
@PostMapping public AjaxResult add(@RequestBody StockWatchlist row) {
  service.add(getUserId(), row.getStockCode(), row.getStockName(), getUsername()); return success();
}
@PreAuthorize("@ss.hasPermi('stock:watchlist:remove')")
@DeleteMapping("/{watchlistId}") public AjaxResult remove(@PathVariable Long watchlistId) {
  service.remove(getUserId(), watchlistId); return success();
}
```

- [ ] **Step 4: Re-run the test and then `mvn -pl ruoyi-admin -am package -DskipTests`.** Expected: both exit 0.
- [ ] **Step 5: Commit.** Stage controller and test; commit `feat: add watchlist API`.

### Task 4: Build the menu and watchlist UI

**Files:** Create `ruoyi-ui/src/api/stock/watchlist.js` and `ruoyi-ui/src/views/stock/watchlist/index.vue`; modify SQL.

- [ ] **Step 1: Add the API client.**

```javascript
export const listWatchlist = () => request({ url: '/stock/watchlist/list', method: 'get' })
export const addWatchlist = data => request({ url: '/stock/watchlist', method: 'post', data })
export const removeWatchlist = id => request({ url: `/stock/watchlist/${id}`, method: 'delete' })
```

- [ ] **Step 2: Implement the Element UI page.** Use form state `{ stockCode: '', stockName: '' }`; call list on `created`; render code/name/create-time columns; call add then clear/reload; confirm deletion through `this.$modal.confirm('确认删除该自选股吗？')`; navigate with `this.$router.push({ path: '/stock/analyzer', query: { stockCode: row.stockCode } })`.
- [ ] **Step 3: Add the menu SQL.** Under parent menu ID 2000 add `stock/watchlist/index` with `stock:watchlist:list`, plus function entries `stock:watchlist:add` and `stock:watchlist:remove`, using new unique menu IDs.
- [ ] **Step 4: Run `npm run build:prod` in `ruoyi-ui`.** Expected: exit 0.
- [ ] **Step 5: Commit.** Stage the API, page, and SQL; commit `feat: add my watchlist page`.

### Task 5: Auto-start analysis from a selected watchlist row

**Files:** Modify `ruoyi-ui/src/views/stock/analyzer/index.vue`.

- [ ] **Step 1: Add the created hook.**

```javascript
created() {
  const stockCode = this.$route.query.stockCode
  if (typeof stockCode === 'string' && stockCode.trim()) {
    this.stockCode = stockCode.trim()
    this.handleAnalyze()
  }
}
```

- [ ] **Step 2: Run `npm run build:prod` in `ruoyi-ui`.** Expected: exit 0.
- [ ] **Step 3: Run final verification.** Execute `mvn -pl ruoyi-system -Dtest=StockWatchlistServiceImplTest test`, `mvn -pl ruoyi-admin -am package -DskipTests`, and the frontend production build. Manually verify two users see only their own rows and a row’s 分析 button opens the populated report.
- [ ] **Step 4: Commit.** Stage analyzer page; commit `feat: analyze stocks from watchlist`.

## Plan self-review

- Spec coverage: Tasks 1–3 implement validation, durable user-isolated CRUD, duplicate handling, and permissions. Tasks 4–5 implement the page, SQL menu, and analysis handoff.
- Placeholder scan: no deferred or unspecified implementation step is present.
- Type consistency: `StockWatchlist`, `watchlistId`, `stockCode`, mapper signatures, API routes, and permissions are consistent throughout.
