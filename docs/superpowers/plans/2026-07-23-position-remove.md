# Position Remove Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a permission-controlled row-level remove action that permanently deletes a user's position and saved analysis snapshot while preserving account settings.

**Architecture:** Delete the scoped position before its snapshot in one transaction. Make snapshot persistence conditional on the same user's position still existing and lock that source row in share mode, so an analysis response that arrives after removal cannot recreate orphan data under either common InnoDB isolation level. Expose a DELETE endpoint and add a confirmation-based frontend action that clears row-local state and reloads the list.

**Tech Stack:** Java 17, Spring Boot, Spring Transaction, MyBatis, JUnit 5, Vue 2.6, Element UI, Node.js source contract tests

## Task 1: Implement concurrency-safe transactional removal

**Files:**

- `ruoyi-system/src/main/java/com/ruoyi/system/mapper/stock/StockPositionAnalysisSnapshotMapper.java`
- `ruoyi-system/src/main/resources/mapper/stock/StockPositionAnalysisSnapshotMapper.xml`
- `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockPositionServiceImpl.java`
- `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockPositionServiceImplTest.java`
- `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockPositionAnalysisSnapshotServiceImplTest.java`

- [x] Add a scoped snapshot delete mapper method using `userId + positionId`.
- [x] Make `remove` transactional and delete the scoped position before deleting its snapshot.
- [x] Throw `ServiceException("position not found")` without touching snapshots when the scoped position does not exist.
- [x] Change snapshot upsert to `INSERT ... SELECT ... FROM stock_position ... LOCK IN SHARE MODE` with matching user and position IDs.
- [x] Test deletion order, missing-position behavior, transaction annotation, scoped SQL, and conditional snapshot persistence.
- [x] Run:

```powershell
mvn -pl ruoyi-system -am "-Dtest=StockPositionServiceImplTest,StockPositionAnalysisSnapshotServiceImplTest" "-Dsurefire.failIfNoSpecifiedTests=false" test
```

## Task 2: Expose the permission-controlled endpoint

**Files:**

- `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java`
- `tests/stock-position-controller-contract.test.js`

- [x] First add a failing dependency-free source contract, because `ruoyi-admin` has no JUnit test dependency.
- [x] Add `DELETE /stock/position/{id}`.
- [x] Require `stock:position:remove`.
- [x] Call `service.remove(getUserId(), id)`.
- [x] Run:

```powershell
node tests/stock-position-controller-contract.test.js
```

## Task 3: Add the frontend remove action

**Files:**

- `ruoyi-ui/src/api/stock/position.js`
- `ruoyi-ui/src/views/stock/position/index.vue`
- `ruoyi-ui/tests/position-remove.test.js`
- `ruoyi-ui/package.json`

- [x] Add the DELETE API.
- [x] Add a permission-controlled danger action to each position row.
- [x] Confirm with stock name/code and snapshot cleanup warning.
- [x] On success, collapse the row; clear reports, loading, AI, and request-version state; then reload.
- [x] Preserve account settings.
- [x] Run:

```powershell
npm --prefix ruoyi-ui run test:position-remove
```

## Task 4: Verify the integrated change

- [x] Run all backend tests:

```powershell
mvn -pl ruoyi-admin -am test
```

- [x] Run source and frontend contracts:

```powershell
node tests/stock-position-controller-contract.test.js
npm --prefix ruoyi-ui run test:stock-expand
npm --prefix ruoyi-ui run test:position-remove
```

- [x] Run the frontend production build:

```powershell
npm --prefix ruoyi-ui run build:prod
```

- [x] Inspect whitespace, scope, commits, and worktree status:

```powershell
git diff --check
git status --short
git log --oneline -7
```
