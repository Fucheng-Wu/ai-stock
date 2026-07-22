# 持仓分析快照 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按登录用户保存每条持仓的最新客观分析和 AI 报告，并用 `>` / `∨` 懒加载展示。

**Architecture:** 在持仓领域旁新增用户持仓快照 mapper/service，使用唯一键 upsert 保存完整 `StockAnalysisResult` JSON。持仓分析接口保存其结果，前端在展开时读取快照而非重新分析。

**Tech Stack:** Spring Boot、MyBatis、Fastjson2、MySQL、Vue 2、Element UI、JUnit 5。

---

### Task 1: 快照存储层

**Files:**
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/domain/stock/StockPositionAnalysisSnapshot.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/mapper/stock/StockPositionAnalysisSnapshotMapper.java`
- Create: `ruoyi-system/src/main/resources/mapper/stock/StockPositionAnalysisSnapshotMapper.xml`
- Modify: `sql/stock_menu.sql`

- [ ] **Step 1: 为 `StockPositionAnalysisSnapshot` 写入 `snapshotId`、`userId`、`positionId`、`analysisJson`、`analyzedAt` 的 JavaBean。**

```java
public class StockPositionAnalysisSnapshot {
  private Long snapshotId;
  private Long userId;
  private Long positionId;
  private String analysisJson;
  private Date analyzedAt;
  // getters/setters
}
```

- [ ] **Step 2: 创建 mapper 及 XML，以用户和持仓查询，并通过唯一键覆盖写入。**

```xml
<select id="select" resultType="StockPositionAnalysisSnapshot">
 select * from stock_position_analysis_snapshot where user_id=#{userId} and position_id=#{positionId}
</select>
<insert id="upsert">
 insert into stock_position_analysis_snapshot(user_id,position_id,analysis_json,analyzed_at,create_time,update_time)
 values(#{userId},#{positionId},#{analysisJson},#{analyzedAt},sysdate(),sysdate())
 on duplicate key update analysis_json=#{analysisJson},analyzed_at=#{analyzedAt},update_time=sysdate()
</insert>
```

- [ ] **Step 3: 在 SQL 脚本追加 `stock_position_analysis_snapshot` 建表语句与 `(user_id, position_id)` 唯一索引。**

- [ ] **Step 4: 运行 `mvn -pl ruoyi-system -am -DskipTests compile`，预期 `BUILD SUCCESS`。**

### Task 2: 用户范围快照服务（TDD）

**Files:**
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/service/IStockPositionAnalysisSnapshotService.java`
- Create: `ruoyi-system/src/main/java/com/ruoyi/system/service/impl/StockPositionAnalysisSnapshotServiceImpl.java`
- Create: `ruoyi-system/src/test/java/com/ruoyi/system/service/impl/StockPositionAnalysisSnapshotServiceImplTest.java`

- [ ] **Step 1: 先写失败测试：相同用户/持仓保存两次后读取第二次结果，另一用户返回空。**

```java
@Test void savesLatestResultForOneUserAndPosition() {
  service.save(1L, 10L, result("first"));
  service.save(1L, 10L, result("second"));
  assertEquals("second", service.get(1L, 10L).getAiAdvice());
  assertNull(service.get(2L, 10L));
}
```

- [ ] **Step 2: 运行 `mvn -pl ruoyi-system -Dtest=StockPositionAnalysisSnapshotServiceImplTest test`，预期因类不存在失败。**

- [ ] **Step 3: 实现接口 `get(Long userId, Long positionId)`、`save(Long userId, Long positionId, StockAnalysisResult result)`；使用 `JSON.toJSONString` 和 `JSON.parseObject`。**

- [ ] **Step 4: 运行同一测试，预期通过。**

### Task 3: 持仓分析接口接入快照

**Files:**
- Modify: `ruoyi-admin/src/main/java/com/ruoyi/web/controller/stock/StockPositionController.java`

- [ ] **Step 1: 注入快照服务，增加 `GET /stock/position/{id}/analysis`；先用 `service.get(getUserId(), id)` 验证持仓，再返回快照服务的结果。**

- [ ] **Step 2: 修改 `POST /{id}/analyze`：计算完持仓与大盘数据后，非 AI 请求从旧快照复制 `aiAdvice`、`aiReason`、`riskLevel`，然后 `snapshotService.save` 并返回结果。**

```java
if (!includeAi) {
  StockAnalysisResult previous = snapshotService.get(getUserId(), id);
  if (previous != null) { r.setAiAdvice(previous.getAiAdvice()); r.setAiReason(previous.getAiReason()); r.setRiskLevel(previous.getRiskLevel()); }
}
snapshotService.save(getUserId(), id, r);
```

- [ ] **Step 3: 运行 `mvn -pl ruoyi-system -am '-Dtest=StockPositionAnalysisSnapshotServiceImplTest,StockPositionServiceImplTest,StockAnalyzerServiceImplTest' '-Dsurefire.failIfNoSpecifiedTests=false' test`，预期通过。**

### Task 4: 持仓页显示已保存快照

**Files:**
- Modify: `ruoyi-ui/src/api/stock/position.js`
- Modify: `ruoyi-ui/src/views/stock/position/index.vue`

- [ ] **Step 1: API 增加 `getPositionAnalysis(id)`，请求 `GET /stock/position/${id}/analysis`。**

- [ ] **Step 2: 以固定宽度普通列显示 `>` / `∨`，点击调用 `toggle(row)`；受控展开列继续承载面板。**

```html
<el-table-column width="44"><template slot-scope="s"><el-button type="text" @click="toggle(s.row)">{{ expanded[0]===s.row.positionId ? '∨' : '>' }}</el-button></template></el-table-column>
```

- [ ] **Step 3: `toggle` 仅在展开时调用 `getPositionAnalysis`，保存到 `reports[id]`；无数据时显示“暂无已保存分析”，并保留“分析”和“AI 分析”入口。**

- [ ] **Step 4: 客观“分析”和“AI 分析”成功后更新 `reports[id]`，AI 成功同时设置 `aiShown[id] = true`。**

- [ ] **Step 5: 运行 `npm run build:prod`（目录 `ruoyi-ui`），预期生产构建成功。**

### Task 5: 完整验证与提交

**Files:**
- Modify: 上述实现文件

- [ ] **Step 1: 运行 `git diff --check`，预期无输出。**
- [ ] **Step 2: 运行 `mvn -pl ruoyi-admin -am package -DskipTests`，预期 `BUILD SUCCESS`。**
- [ ] **Step 3: 运行 `git status --short`，确认仅包含本功能文件。**
- [ ] **Step 4: 提交实现：`git add ... && git commit -m "feat: persist position analysis snapshots"`。**
