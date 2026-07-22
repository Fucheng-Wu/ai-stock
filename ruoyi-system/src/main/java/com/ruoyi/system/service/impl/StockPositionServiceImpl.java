package com.ruoyi.system.service.impl;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import org.springframework.stereotype.Service;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.system.domain.stock.StockAccount;
import com.ruoyi.system.domain.stock.StockPosition;
import com.ruoyi.system.mapper.stock.StockPositionMapper;
import com.ruoyi.system.service.IStockPositionService;

@Service
public class StockPositionServiceImpl implements IStockPositionService {
  private final StockPositionMapper mapper;
  public StockPositionServiceImpl(StockPositionMapper mapper) { this.mapper = mapper; }
  public BigDecimal marketValue(BigDecimal price, long quantity) { return price.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP); }
  public BigDecimal percent(BigDecimal value, BigDecimal total) { return total.signum() == 0 ? null : value.multiply(BigDecimal.valueOf(100)).divide(total, 2, RoundingMode.HALF_UP); }
  private void valid(StockPosition p) { if (p.getCostPrice() == null || p.getCostPrice().signum() <= 0 || p.getQuantity() == null || p.getQuantity() <= 0) throw new ServiceException("invalid position"); }
  public List<StockPosition> list(Long userId) { return mapper.list(userId); }
  public StockPosition get(Long userId, Long id) { StockPosition p = mapper.select(id, userId); if (p == null) throw new ServiceException("position not found"); return p; }
  public void add(Long userId, StockPosition p, String name) { valid(p); if (mapper.exists(userId, p.getStockCode())) throw new ServiceException("duplicate position"); p.setUserId(userId); p.setCreateBy(name); mapper.insert(p); }
  public void update(Long userId, StockPosition p, String name) { valid(p); p.setUserId(userId); p.setUpdateBy(name); if (mapper.update(p) == 0) throw new ServiceException("position not found"); }
  public void remove(Long userId, Long id) { if (mapper.delete(id, userId) == 0) throw new ServiceException("position not found"); }
  public StockAccount account(Long userId) { return mapper.account(userId); }
  public void saveAccount(Long userId, StockAccount account) { if (account.getTotalAssets() == null || account.getTotalAssets().signum() <= 0) throw new ServiceException("invalid assets"); account.setUserId(userId); mapper.upsertAccount(account); }
}
