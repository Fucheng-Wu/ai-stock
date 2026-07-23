package com.ruoyi.system.service.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import com.ruoyi.system.domain.stock.StockAnalysisResult;
import com.ruoyi.system.domain.stock.StockPositionAnalysisSnapshot;
import com.ruoyi.system.mapper.stock.StockPositionAnalysisSnapshotMapper;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class StockPositionAnalysisSnapshotServiceImplTest {
  @Test void mapsUnderscoreSnapshotColumnsExplicitly() throws Exception {
    try (InputStream input = getClass().getClassLoader().getResourceAsStream("mapper/stock/StockPositionAnalysisSnapshotMapper.xml")) {
      String xml = new String(input.readAllBytes(), StandardCharsets.UTF_8);
      assertEquals(true, xml.contains("<resultMap id=\"Snapshot\""));
      assertEquals(true, xml.contains("resultMap=\"Snapshot\""));
    }
  }

  @Test void savesLatestResultForOneUserAndPosition() {
    StockPositionAnalysisSnapshotServiceImpl service = new StockPositionAnalysisSnapshotServiceImpl(new MemoryMapper());
    service.save(1L, 10L, result("first"));
    service.save(1L, 10L, result("second"));
    assertEquals("second", service.get(1L, 10L).getAiAdvice());
    assertNull(service.get(2L, 10L));
  }

  private StockAnalysisResult result(String advice) { StockAnalysisResult result = new StockAnalysisResult(); result.setAiAdvice(advice); return result; }

  static class MemoryMapper implements StockPositionAnalysisSnapshotMapper {
    private final Map<String, StockPositionAnalysisSnapshot> values = new HashMap<>();
    public StockPositionAnalysisSnapshot select(Long userId, Long positionId) { return values.get(userId + ":" + positionId); }
    public int upsert(StockPositionAnalysisSnapshot snapshot) { values.put(snapshot.getUserId() + ":" + snapshot.getPositionId(), snapshot); return 1; }
    public int delete(Long userId, Long positionId) { return values.remove(userId + ":" + positionId) == null ? 0 : 1; }
  }
}
