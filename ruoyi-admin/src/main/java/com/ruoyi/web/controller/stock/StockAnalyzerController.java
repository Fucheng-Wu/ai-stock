package com.ruoyi.web.controller.stock;

import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.ruoyi.common.core.controller.BaseController;
import com.ruoyi.common.core.domain.AjaxResult;
import com.ruoyi.system.domain.stock.StockAnalysisResult;
import com.ruoyi.system.service.IStockAnalyzerService;

@RestController
@RequestMapping("/stock/analyzer")
public class StockAnalyzerController extends BaseController
{
    @Autowired
    private IStockAnalyzerService stockAnalyzerService;

    @PreAuthorize("@ss.hasPermi('stock:analyzer:analyze')")
    @PostMapping("/analyze")
    public AjaxResult analyze(@RequestBody Map<String, String> params)
    {
        String stockCode = params.get("stockCode");
        if (stockCode == null || stockCode.trim().isEmpty())
        {
            return error("股票代码不能为空");
        }
        try
        {
            boolean includeAi = !params.containsKey("includeAi") || Boolean.parseBoolean(params.get("includeAi"));
            StockAnalysisResult result = stockAnalyzerService.analyze(stockCode.trim(), includeAi);
            return success(result);
        }
        catch (Exception e)
        {
            return error("分析失败: " + e.getMessage());
        }
    }
}
