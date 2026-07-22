package com.ruoyi.system.domain.stock;
import java.math.BigDecimal;
import com.ruoyi.common.core.domain.BaseEntity;
public class StockPosition extends BaseEntity { private Long positionId,userId; private String stockCode,stockName; private BigDecimal costPrice; private Long quantity;
 public Long getPositionId(){return positionId;} public void setPositionId(Long v){positionId=v;} public Long getUserId(){return userId;} public void setUserId(Long v){userId=v;} public String getStockCode(){return stockCode;} public void setStockCode(String v){stockCode=v;} public String getStockName(){return stockName;} public void setStockName(String v){stockName=v;} public BigDecimal getCostPrice(){return costPrice;} public void setCostPrice(BigDecimal v){costPrice=v;} public Long getQuantity(){return quantity;} public void setQuantity(Long v){quantity=v;} }
