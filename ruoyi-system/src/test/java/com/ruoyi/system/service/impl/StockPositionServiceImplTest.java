package com.ruoyi.system.service.impl;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.system.domain.stock.StockAccount;
import com.ruoyi.system.domain.stock.StockPosition;
import com.ruoyi.system.domain.stock.StockPositionAnalysisSnapshot;
import com.ruoyi.system.mapper.stock.StockPositionAnalysisSnapshotMapper;
import com.ruoyi.system.mapper.stock.StockPositionMapper;
class StockPositionServiceImplTest {
  @Test void infersMarketAndPersistsIt() throws Exception {
    StockPositionServiceImpl service = new StockPositionServiceImpl(null, null);
    assertEquals("sh", service.marketForCode("600519"));
    assertEquals("sz", service.marketForCode("000001"));
    assertEquals("sz", service.marketForCode("300750"));
    try (InputStream input = getClass().getClassLoader().getResourceAsStream("mapper/stock/StockPositionMapper.xml")) {
      String xml = new String(input.readAllBytes(), StandardCharsets.UTF_8);
      assertEquals(true, xml.contains("stock_name,market,cost_price"));
      assertEquals(true, xml.contains("#{market}"));
    }
  }

  @Test void mapsAccountColumnsExplicitly() throws Exception {
    try (InputStream input = getClass().getClassLoader().getResourceAsStream("mapper/stock/StockPositionMapper.xml")) {
      String xml = new String(input.readAllBytes(), StandardCharsets.UTF_8);
      assertEquals(true, xml.contains("<resultMap id=\"Account\""));
      assertEquals(true, xml.contains("resultMap=\"Account\""));
    }
  }

  @Test void calculatesPositionPercentFromLatestMarketValue() {
    StockPositionServiceImpl service = new StockPositionServiceImpl(null, null);
    Map<String, Object> holding = new HashMap<>();
    holding.put("marketValue", new BigDecimal("25000"));
    assertEquals(new BigDecimal("25.00"), service.positionPercent(holding, new BigDecimal("100000")));
    assertNull(service.positionPercent(null, new BigDecimal("100000")));
    assertNull(service.positionPercent(holding, null));
  }

  @Test void calculatesHoldingValues() {
    StockPositionServiceImpl service = new StockPositionServiceImpl(null, null);
    assertEquals(new BigDecimal("250.00"), service.marketValue(new BigDecimal("25"), 10));
    assertEquals(new BigDecimal("25.00"), service.percent(new BigDecimal("50"), new BigDecimal("200")));
    assertEquals(new BigDecimal("20.00"), service.percent(new BigDecimal("200"), new BigDecimal("1000")));
  }

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
}
