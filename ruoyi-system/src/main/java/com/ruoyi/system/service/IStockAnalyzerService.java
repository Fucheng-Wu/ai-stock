package com.ruoyi.system.service;

import java.util.Map;
import java.util.List;
import com.ruoyi.system.domain.stock.StockAnalysisResult;
import com.ruoyi.system.domain.stock.StockKlineData;
import com.ruoyi.system.domain.stock.StockRealtimeData;
import com.ruoyi.system.domain.stock.StockSearchResult;

public interface IStockAnalyzerService
{
    List<StockSearchResult> searchStocks(String keyword);

    StockRealtimeData getRealtimeData(String stockCode);

    List<StockKlineData> getKlineData(String stockCode, int limit);

    StockAnalysisResult analyze(String stockCode);

    StockAnalysisResult analyze(String stockCode, boolean includeAi);

    StockAnalysisResult completeHoldingAnalysis(StockAnalysisResult result, Map<String, Object> holding, boolean includeAi);

    String resolveStockName(String stockCode);
}
