# Position Remove Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a permission-controlled row-level remove action that atomically deletes a user's position and its saved analysis snapshot while preserving account settings.

**Architecture:** Extend the existing position service transaction to delete the snapshot before the position, using both user ID and position ID at every data boundary. Expose the operation through a DELETE controller endpoint, then add a confirmation-based frontend action that clears row-local state and reloads the list.

**Tech Stack:** Java 17, Spring Boot, Spring Transaction, MyBatis, JUnit 5, Vue 2.6, Element UI, Node.js source contract tests

---

## File Structure

- Modify `ruoyi-system/src/main/java/com/ruoyi/system/mapper/stock/StockPositionAnalysisSnapshotMapper.java`: define scoped snapshot deletion.
- Modify `ruoyi-system/src/main/resources/mapper/stock/StockPositionAnalysisSnapshotMapper.xml`: delete snapshot by user and position.
- Modify `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockPositionServiceImpl.java`: make position removal transactional and clean snapshots.
- Modify `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockPositionServiceImplTest.java`: verify coordinated deletion, missing-position behavior, and transaction annotation.
- Create `ruoyi-admin/src/test/java/com/ruoyi/web/controller/stock/StockPositionControllerContractTest.java`: verify the DELETE route and permission.
- Modify `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java`: expose the remove endpoint.
- Create `ruoyi-ui/tests/position-remove.test.js`: dependency-free frontend API and UI contract.
- Modify `ruoyi-ui/package.json`: add the focused frontend test command.
- Modify `ruoyi-ui/src/api/stock/position.js`: add the DELETE request.
- Modify `ruoyi-ui/src/views/stock/position/index.vue`: add remove action, confirmation, cache cleanup, and reload.

### Task 1: Atomically Remove the Snapshot and Position

**Files:**
- Modify: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockPositionServiceImplTest.java`
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/mapper/stock/StockPositionAnalysisSnapshotMapper.java`
- Modify: `ruoyi-system/src/main/resources/mapper/stock/StockPositionAnalysisSnapshotMapper.xml`
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockPositionServiceImpl.java`

- [ ] **Step 1: Write failing service tests**

Add these imports to `StockPositionServiceImplTest.java`:

```java
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import java.util.List;
import org.springframework.transaction.annotation.Transactional;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.system.domain.stock.StockAccount;
import com.ruoyi.system.domain.stock.StockPosition;
import com.ruoyi.system.domain.stock.StockPositionAnalysisSnapshot;
import com.ruoyi.system.mapper.stock.StockPositionAnalysisSnapshotMapper;
import com.ruoyi.system.mapper.stock.StockPositionMapper;
```

Change the existing constructor calls from:

```java
new StockPositionServiceImpl(null)
```

to:

```java
new StockPositionServiceImpl(null, null)
```

Add these tests and fakes inside the test class:

```java
@Test void removesSnapshotBeforePositionInsideTransaction() throws Exception {
  FakePositionMapper positions = new FakePositionMapper();
  FakeSnapshotMapper snapshots = new FakeSnapshotMapper();
  StockPositionServiceImpl service = new StockPositionServiceImpl(positions, snapshots);

  service.remove(7L, 9L);

  assertEquals(1, snapshots.deleteCalls);
  assertEquals(7L, snapshots.userId);
  assertEquals(9L, snapshots.positionId);
  assertEquals(1, positions.deleteCalls);
  assertTrue(StockPositionServiceImpl.class
      .getMethod("remove", Long.class, Long.class)
      .isAnnotationPresent(Transactional.class));
}

@Test void rejectsMissingPositionAfterScopedSnapshotDelete() {
  FakePositionMapper positions = new FakePositionMapper();
  positions.deleteResult = 0;
  FakeSnapshotMapper snapshots = new FakeSnapshotMapper();
  StockPositionServiceImpl service = new StockPositionServiceImpl(positions, snapshots);

  assertThrows(ServiceException.class, () -> service.remove(7L, 9L));
  assertEquals(1, snapshots.deleteCalls);
  assertEquals(1, positions.deleteCalls);
}

@Test void scopesSnapshotDeleteByUserAndPosition() throws Exception {
  try (InputStream input = getClass().getClassLoader()
      .getResourceAsStream("mapper/stock/StockPositionAnalysisSnapshotMapper.xml")) {
    String xml = new String(input.readAllBytes(), StandardCharsets.UTF_8);
    assertTrue(xml.contains("<delete id=\"delete\">"));
    assertTrue(xml.contains("where user_id=#{userId} and position_id=#{positionId}"));
  }
}

private static class FakeSnapshotMapper implements StockPositionAnalysisSnapshotMapper {
  int deleteCalls;
  Long userId;
  Long positionId;

  @Override public StockPositionAnalysisSnapshot select(Long userId, Long positionId) { return null; }
  @Override public int upsert(StockPositionAnalysisSnapshot snapshot) { return 0; }
  @Override public int delete(Long userId, Long positionId) {
    deleteCalls++;
    this.userId = userId;
    this.positionId = positionId;
    return 1;
  }
}

private static class FakePositionMapper implements StockPositionMapper {
  int deleteCalls;
  int deleteResult = 1;

  @Override public List<StockPosition> list(Long userId) { return List.of(); }
  @Override public StockPosition select(Long id, Long userId) { return null; }
  @Override public boolean exists(Long userId, String code) { return false; }
  @Override public int insert(StockPosition position) { return 0; }
  @Override public int update(StockPosition position) { return 0; }
  @Override public int delete(Long id, Long userId) { deleteCalls++; return deleteResult; }
  @Override public StockAccount account(Long userId) { return null; }
  @Override public int upsertAccount(StockAccount account) { return 0; }
}
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```powershell
mvn -pl ruoyi-system -am "-Dtest=StockPositionServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

Expected: compilation fails because the snapshot mapper has no `delete` method and `StockPositionServiceImpl` does not yet accept the snapshot mapper.

- [ ] **Step 3: Add scoped snapshot deletion**

Add to `StockPositionAnalysisSnapshotMapper.java`:

```java
int delete(@Param("userId") Long userId, @Param("positionId") Long positionId);
```

Add to `StockPositionAnalysisSnapshotMapper.xml`:

```xml
<delete id="delete">
  delete from stock_position_analysis_snapshot
  where user_id=#{userId} and position_id=#{positionId}
</delete>
```

- [ ] **Step 4: Make service removal transactional**

Update the service fields, constructor, import, and removal method:

```java
import org.springframework.transaction.annotation.Transactional;
import com.ruoyi.system.mapper.stock.StockPositionAnalysisSnapshotMapper;

private final StockPositionMapper mapper;
private final StockPositionAnalysisSnapshotMapper snapshotMapper;

public StockPositionServiceImpl(
    StockPositionMapper mapper,
    StockPositionAnalysisSnapshotMapper snapshotMapper) {
  this.mapper = mapper;
  this.snapshotMapper = snapshotMapper;
}

@Transactional
public void remove(Long userId, Long id) {
  snapshotMapper.delete(userId, id);
  if (mapper.delete(id, userId) == 0) {
    throw new ServiceException("position not found");
  }
}
```

- [ ] **Step 5: Run the focused service test to verify GREEN**

Run:

```powershell
mvn -pl ruoyi-system -am "-Dtest=StockPositionServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

Expected: 7 tests pass with 0 failures and 0 errors.

- [ ] **Step 6: Commit the transactional removal**

```powershell
git add -- ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockPositionServiceImplTest.java ruoyi-system/src/main/java/com/ruoyi/system/mapper/stock/StockPositionAnalysisSnapshotMapper.java ruoyi-system/src/main/resources/mapper/stock/StockPositionAnalysisSnapshotMapper.xml ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockPositionServiceImpl.java
git commit -m "feat: remove position analysis atomically"
```

### Task 2: Expose the Permission-Controlled Delete Endpoint

**Files:**
- Create: `ruoyi-admin/src/test/java/com/ruoyi/web/controller/stock/StockPositionControllerContractTest.java`
- Modify: `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java`

- [ ] **Step 1: Write the failing controller contract test**

Create `StockPositionControllerContractTest.java`:

```java
package com.ruoyi.web.controller.stock;

import static org.junit.jupiter.api.Assertions.assertTrue;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class StockPositionControllerContractTest {
  @Test void exposesScopedPositionRemoveEndpoint() throws Exception {
    String source = Files.readString(
        Path.of("src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java"),
        StandardCharsets.UTF_8);
    String compact = source.replaceAll("\\s+", "");

    assertTrue(source.contains("stock:position:remove"));
    assertTrue(source.contains("@DeleteMapping(\"/{id}\")"));
    assertTrue(compact.contains("service.remove(getUserId(),id)"));
  }
}
```

- [ ] **Step 2: Run the controller contract to verify RED**

Run:

```powershell
mvn -pl ruoyi-admin -am "-Dtest=StockPositionControllerContractTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

Expected: FAIL because the controller source does not contain the remove permission or DELETE route.

- [ ] **Step 3: Add the delete endpoint**

Add this method to `StockPositionController` before the closing brace:

```java
@PreAuthorize("@ss.hasPermi('stock:position:remove')")
@DeleteMapping("/{id}")
public AjaxResult remove(@PathVariable Long id) {
  service.remove(getUserId(), id);
  return success();
}
```

When preserving the controller's compact formatting, the equivalent single-line method is acceptable as long as the annotations, path, permission, current-user lookup, and service call remain exact.

- [ ] **Step 4: Run the controller contract to verify GREEN**

Run:

```powershell
mvn -pl ruoyi-admin -am "-Dtest=StockPositionControllerContractTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

Expected: 1 controller contract test passes; reactor build succeeds.

- [ ] **Step 5: Commit the endpoint**

```powershell
git add -- ruoyi-admin/src/test/java/com/ruoyi/web/controller/stock/StockPositionControllerContractTest.java ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java
git commit -m "feat: expose position remove endpoint"
```

### Task 3: Add the Frontend Remove Action

**Files:**
- Create: `ruoyi-ui/tests/position-remove.test.js`
- Modify: `ruoyi-ui/package.json`
- Modify: `ruoyi-ui/src/api/stock/position.js`
- Modify: `ruoyi-ui/src/views/stock/position/index.vue`

- [ ] **Step 1: Write the failing frontend contract**

Create `ruoyi-ui/tests/position-remove.test.js`:

```js
const assert = require('assert')
const fs = require('fs')
const path = require('path')

const uiRoot = path.resolve(__dirname, '..')
const read = relativePath => fs.readFileSync(path.join(uiRoot, relativePath), 'utf8')
const api = read('src/api/stock/position.js')
const page = read('src/views/stock/position/index.vue')

assert(api.includes('export const removePosition=id=>request'))
assert(api.includes('url:`/stock/position/${id}`'))
assert(api.includes("method:'delete'"))
assert(page.includes("v-hasPermi=\"['stock:position:remove']\""))
assert(page.includes('@click="handleRemove(scope.row)"'))
assert(page.includes('handleRemove(row)'))
assert(page.includes('removePosition(id)'))
assert(page.includes('this.$delete(this.reports, id)'))
assert(page.includes('this.$delete(this.analysisRequestVersions, id)'))
assert(page.includes('this.load()'))

console.log('position remove contracts passed')
```

Add the script to `ruoyi-ui/package.json`:

```json
"test:position-remove": "node tests/position-remove.test.js",
```

- [ ] **Step 2: Run the frontend contract to verify RED**

Run:

```powershell
npm --prefix ruoyi-ui run test:position-remove
```

Expected: FAIL because the position API and page do not yet contain removal support.

- [ ] **Step 3: Add the frontend DELETE API**

Add to `ruoyi-ui/src/api/stock/position.js`:

```js
export const removePosition=id=>request({url:`/stock/position/${id}`,method:'delete'})
```

- [ ] **Step 4: Add the row action and expand the action column**

Change the action column to `width="270"` and add this button after “分析”:

```vue
<el-button
  v-hasPermi="['stock:position:remove']"
  class="danger-action"
  type="text"
  icon="el-icon-delete"
  @click="handleRemove(scope.row)"
>移除</el-button>
```

Import `removePosition` in the existing position API import list.

- [ ] **Step 5: Add confirmation, cleanup, and reload behavior**

Add this method after `saveEdit`:

```js
handleRemove(row) {
  const id = row.positionId
  const stockLabel = `${row.stockName || '未命名股票'}（${row.stockCode}）`
  this.$modal.confirm(
    `确认移除 ${stockLabel} 吗？此操作将同时删除已保存的分析记录。`
  ).then(() => {
    return removePosition(id)
  }).then(() => {
    if (this.expanded[0] === id) this.expanded = []
    this.$delete(this.reports, id)
    this.$delete(this.loaded, id)
    this.$delete(this.loading, id)
    this.$delete(this.aiLoading, id)
    this.$delete(this.aiShown, id)
    this.$delete(this.analysisRequestVersions, id)
    this.$modal.msgSuccess('移除成功')
    this.load()
  }).catch(() => {})
},
```

Add the page-local danger style before the media queries:

```scss
.danger-action {
  color: #d92d20;
}
```

- [ ] **Step 6: Run the frontend contract to verify GREEN**

Run:

```powershell
npm --prefix ruoyi-ui run test:position-remove
```

Expected: exit code 0 and `position remove contracts passed`.

- [ ] **Step 7: Commit the frontend remove action**

```powershell
git add -- ruoyi-ui/tests/position-remove.test.js ruoyi-ui/package.json ruoyi-ui/src/api/stock/position.js ruoyi-ui/src/views/stock/position/index.vue
git commit -m "feat: add position remove action"
```

### Task 4: Verify the Integrated Change

**Files:**
- Verify all files changed in Tasks 1-3.

- [ ] **Step 1: Run focused backend tests**

```powershell
mvn -pl ruoyi-system -am "-Dtest=StockPositionServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
mvn -pl ruoyi-admin -am "-Dtest=StockPositionControllerContractTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

Expected: both Maven invocations succeed with 0 failures and 0 errors.

- [ ] **Step 2: Run both focused frontend contracts**

```powershell
npm --prefix ruoyi-ui run test:stock-expand
npm --prefix ruoyi-ui run test:position-remove
```

Expected: both commands exit 0 and print their success messages.

- [ ] **Step 3: Run the frontend production build**

```powershell
npm --prefix ruoyi-ui run build:prod
```

Expected: exit code 0 and `Build complete`; existing asset-size warnings are acceptable.

- [ ] **Step 4: Inspect whitespace, scope, and commits**

```powershell
git diff --check
git status --short
git log --oneline -7
```

Expected: no whitespace errors; only intended files differ or all feature files are committed.
