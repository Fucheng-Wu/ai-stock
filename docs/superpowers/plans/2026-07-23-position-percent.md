# 持仓总资产回显与比例 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 回显登录用户已保存的账户总资产，并在持仓列表显示最近分析市值对应的持仓比例。

**Architecture:** 使用显式 MyBatis 映射修复账户读取。持仓列表接口读取用户的最新分析快照，从 `holding.marketValue` 与当前总资产实时计算比例，作为非持久化字段返回前端。

**Tech Stack:** Spring Boot、MyBatis、Fastjson2、Vue 2、Element UI、JUnit 5。

---

### Task 1: 修复账户回显映射

**Files:**
- Modify: `ruoyi-system/src/main/resources/mapper/stock/StockPositionMapper.xml`
- Modify: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockPositionServiceImplTest.java`

- [ ] **Step 1: 增加失败测试，读取 mapper XML 并断言账户查询使用 `Account` resultMap。**
- [ ] **Step 2: 运行 `mvn -pl ruoyi-system -am '-Dtest=StockPositionServiceImplTest' '-Dsurefire.failIfNoSpecifiedTests=false' test`，预期断言失败。**
- [ ] **Step 3: 在 XML 增加 `user_id -> userId`、`total_assets -> totalAssets` 显式映射，并让账户查询引用它。**
- [ ] **Step 4: 复跑测试，预期通过。**

### Task 2: 计算并返回持仓比例

**Files:**
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockPosition.java`
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/service/IStockPositionService.java`
- Modify: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockPositionServiceImpl.java`
- Modify: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockPositionServiceImplTest.java`
- Modify: `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java`

- [ ] **Step 1: 增加失败测试：`25000 / 100000` 返回 `25.00`，空总资产返回空。**
- [ ] **Step 2: 运行持仓服务测试并确认失败原因是接口行为未实现。**
- [ ] **Step 3: 为 `StockPosition` 增加 `positionPct`，在服务接口公开 `percent` 计算。**
- [ ] **Step 4: 列表接口逐条读取当前用户快照，从 `holding.marketValue` 计算并设置 `positionPct`；缺失数据保持空。**
- [ ] **Step 5: 复跑持仓与快照测试，预期通过。**

### Task 3: 前端列表展示与刷新

**Files:**
- Modify: `ruoyi-ui/src/views/stock/position/index.vue`

- [ ] **Step 1: 增加“持仓比例”列，有值显示两位小数和 `%`，空值显示“暂无”。**
- [ ] **Step 2: 保存账户总资产成功后调用 `load()`，立即重算列表比例。**
- [ ] **Step 3: 在 `ruoyi-ui` 运行 `npm run build:prod`，预期构建成功。**

### Task 4: 完整验证与提交

**Files:**
- Modify: 上述实现与测试文件

- [ ] **Step 1: 运行全部股票相关后端测试，预期零失败。**
- [ ] **Step 2: 运行 `mvn -pl ruoyi-admin -am package -DskipTests`，预期 `BUILD SUCCESS`。**
- [ ] **Step 3: 运行 `git diff --check`，确认无空白错误。**
- [ ] **Step 4: 提交 `feat: show position percentages`。**
