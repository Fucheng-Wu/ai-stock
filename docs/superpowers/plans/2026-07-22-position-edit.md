# 持仓编辑 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a user to edit holding cost and quantity in a dialog.

**Architecture:** Reuse the existing user-scoped `PUT /stock/position` service method. Add an Element UI dialog that passes only position ID, cost, quantity, and unchanged display fields.

**Tech Stack:** Spring Boot, JUnit 5, Vue 2, Element UI.

---

### Task 1: Verify backend editing and add the dialog

**Files:** Modify `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java`, `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockPositionServiceImplTest.java`, and `ruoyi-ui/src/views/stock/position/index.vue`.

- [ ] **Step 1: Write a failing test that supplies a user-owned position with new positive cost and quantity, then verifies mapper update receives the same user ID.**
- [ ] **Step 2: Run `mvn -pl ruoyi-system -am -Dtest=StockPositionServiceImplTest test`.** Expected: failure if update behavior is inaccessible.
- [ ] **Step 3: Expose `PUT /stock/position` using `service.update(getUserId(), position, getUsername())`.**
- [ ] **Step 4: Add an edit button and Element UI dialog.** Copy the clicked row to `editForm`; keep code disabled; validate positive cost/quantity; call the PUT API, close, and reload on success.
- [ ] **Step 5: Run backend test and `npm run build:prod` in `ruoyi-ui`.** Expected: both exit 0.
- [ ] **Step 6: Commit as `feat: edit stock positions`.**
