package com.ruoyi.system.service.impl;
import static org.junit.jupiter.api.Assertions.assertEquals;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
class StockPositionServiceImplTest {
  @Test void calculatesHoldingValues() {
    StockPositionServiceImpl service = new StockPositionServiceImpl(null);
    assertEquals(new BigDecimal("250.00"), service.marketValue(new BigDecimal("25"), 10));
    assertEquals(new BigDecimal("25.00"), service.percent(new BigDecimal("50"), new BigDecimal("200")));
    assertEquals(new BigDecimal("20.00"), service.percent(new BigDecimal("200"), new BigDecimal("1000")));
  }
}
