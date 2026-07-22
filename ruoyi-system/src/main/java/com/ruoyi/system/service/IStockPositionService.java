package com.ruoyi.system.service;
import java.util.*; import com.ruoyi.system.domain.stock.*;
public interface IStockPositionService { List<StockPosition> list(Long userId); StockPosition get(Long userId,Long id); void add(Long userId,StockPosition p,String name); void update(Long userId,StockPosition p,String name); void remove(Long userId,Long id); StockAccount account(Long userId); void saveAccount(Long userId,StockAccount a); }
