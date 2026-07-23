package com.ruoyi.system.service.impl;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.system.domain.stock.StockAccount;
import com.ruoyi.system.domain.stock.StockPosition;
import com.ruoyi.system.mapper.stock.StockPositionAnalysisSnapshotMapper;
import com.ruoyi.system.mapper.stock.StockPositionMapper;
import com.ruoyi.system.service.IStockPositionService;

@Service
public class StockPositionServiceImpl implements IStockPositionService {
  private final StockPositionMapper mapper;
  private final StockPositionAnalysisSnapshotMapper snapshotMapper;
  public StockPositionServiceImpl(StockPositionMapper mapper, StockPositionAnalysisSnapshotMapper snapshotMapper) {
    this.mapper = mapper;
    this.snapshotMapper = snapshotMapper;
  }
  public BigDecimal marketValue(BigDecimal price, long quantity) { return price.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP); }
  public BigDecimal percent(BigDecimal value, BigDecimal total) { return total.signum() == 0 ? null : value.multiply(BigDecimal.valueOf(100)).divide(total, 2, RoundingMode.HALF_UP); }
  public BigDecimal positionPercent(Map<String, Object> holding, BigDecimal totalAssets) { if (holding == null || totalAssets == null || holding.get("marketValue") == null) return null; return percent(new BigDecimal(String.valueOf(holding.get("marketValue"))), totalAssets); }
  public String marketForCode(String rawCode) { if (rawCode == null) throw new ServiceException("invalid stock code"); String code=rawCode.trim().toLowerCase(); if(code.startsWith("sh")||code.startsWith("sz")) code=code.substring(2); if(!code.matches("[036]\\d{5}")) throw new ServiceException("invalid stock code"); return code.startsWith("6")?"sh":"sz"; }
  private void valid(StockPosition p) { if (p.getCostPrice() == null || p.getCostPrice().signum() <= 0 || p.getQuantity() == null || p.getQuantity() <= 0) throw new ServiceException("invalid position"); }
  public List<StockPosition> list(Long userId) { return mapper.list(userId); }
  public StockPosition get(Long userId, Long id) { StockPosition p = mapper.select(id, userId); if (p == null) throw new ServiceException("position not found"); return p; }
  public void add(Long userId, StockPosition p, String name) { valid(p); String code=p.getStockCode().trim().toLowerCase(); if(code.startsWith("sh")||code.startsWith("sz")) code=code.substring(2); p.setMarket(marketForCode(code));p.setStockCode(code);if (mapper.exists(userId, code)) throw new ServiceException("duplicate position"); p.setUserId(userId); p.setCreateBy(name); mapper.insert(p); }
  public void update(Long userId, StockPosition p, String name) { valid(p); p.setUserId(userId); p.setUpdateBy(name); if (mapper.update(p) == 0) throw new ServiceException("position not found"); }
  @Transactional
  public void remove(Long userId, Long id) {
    if (mapper.delete(id, userId) == 0) throw new ServiceException("position not found");
    snapshotMapper.delete(userId, id);
  }
  public StockAccount account(Long userId) { return mapper.account(userId); }
  public void saveAccount(Long userId, StockAccount account) { if (account.getTotalAssets() == null || account.getTotalAssets().signum() <= 0) throw new ServiceException("invalid assets"); account.setUserId(userId); mapper.upsertAccount(account); }
}
