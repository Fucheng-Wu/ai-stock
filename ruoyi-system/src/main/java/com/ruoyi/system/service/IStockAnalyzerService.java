package com.ruoyi.system.service;

import java.util.Map;
import com.ruoyi.system.domain.stock.StockAnalysisResult;

public interface IStockAnalyzerService
{
    StockAnalysisResult analyze(String stockCode);

    StockAnalysisResult analyze(String stockCode, boolean includeAi);

    StockAnalysisResult completeHoldingAnalysis(StockAnalysisResult result, Map<String, Object> holding, boolean includeAi);

    String resolveStockName(String stockCode);
}
