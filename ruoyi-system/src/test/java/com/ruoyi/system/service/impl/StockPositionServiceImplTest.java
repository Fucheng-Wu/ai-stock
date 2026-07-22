package com.ruoyi.system.service.impl;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import java.io.InputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
class StockPositionServiceImplTest {
  @Test void infersMarketAndPersistsIt() throws Exception {
    StockPositionServiceImpl service = new StockPositionServiceImpl(null);
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
    StockPositionServiceImpl service = new StockPositionServiceImpl(null);
    Map<String, Object> holding = new HashMap<>();
    holding.put("marketValue", new BigDecimal("25000"));
    assertEquals(new BigDecimal("25.00"), service.positionPercent(holding, new BigDecimal("100000")));
    assertNull(service.positionPercent(null, new BigDecimal("100000")));
    assertNull(service.positionPercent(holding, null));
  }

  @Test void calculatesHoldingValues() {
    StockPositionServiceImpl service = new StockPositionServiceImpl(null);
    assertEquals(new BigDecimal("250.00"), service.marketValue(new BigDecimal("25"), 10));
    assertEquals(new BigDecimal("25.00"), service.percent(new BigDecimal("50"), new BigDecimal("200")));
    assertEquals(new BigDecimal("20.00"), service.percent(new BigDecimal("200"), new BigDecimal("1000")));
  }
}
