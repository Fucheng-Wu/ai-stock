package com.ruoyi.system.service.impl;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Arrays;
import org.junit.jupiter.api.Test;
import com.ruoyi.system.domain.stock.StockRealtimeData;

class StockAnalyzerServiceImplTest
{
    @Test
    void onlyRequestsAiWhenExplicitlyIncluded()
    {
        assertFalse(StockAnalyzerServiceImpl.shouldCallAi(false));
        assertTrue(StockAnalyzerServiceImpl.shouldCallAi(true));
    }

    @Test
    void parsesStockNameFromTencentRealtimePayload()
    {
        String[] fields = new String[45];
        Arrays.fill(fields, "");
        fields[1] = "贵州茅台";
        fields[3] = "1500.00";
        fields[4] = "1490.00";
        fields[5] = "1495.00";
        fields[30] = "20260723";
        fields[31] = "150000";
        fields[33] = "1510.00";
        fields[34] = "1488.00";
        fields[36] = "12345";
        fields[37] = "185000000";

        StockAnalyzerServiceImpl service = new StockAnalyzerServiceImpl();
        StockRealtimeData stock = service.parseTencentResponse(
            "sh600519", "v_sh600519=\"" + String.join("~", fields) + "\";"
        );

        assertNotNull(stock);
        assertEquals("贵州茅台", stock.getName());
        assertEquals("sh600519", stock.getCode());
    }

    @Test
    void rejectsInvalidTencentRealtimePayload()
    {
        StockAnalyzerServiceImpl service = new StockAnalyzerServiceImpl();
        assertNull(service.parseTencentResponse("sh600519", "v_sh600519=\"\";"));
    }
}
