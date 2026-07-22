package com.ruoyi.system.mapper.stock;
import java.util.List; import org.apache.ibatis.annotations.Param; import com.ruoyi.system.domain.stock.*;
public interface StockPositionMapper { List<StockPosition> list(Long userId); StockPosition select(@Param("id")Long id,@Param("userId")Long userId); boolean exists(@Param("userId")Long userId,@Param("code")String code); int insert(StockPosition p); int update(StockPosition p); int delete(@Param("id")Long id,@Param("userId")Long userId); StockAccount account(Long userId); int upsertAccount(StockAccount a); }
