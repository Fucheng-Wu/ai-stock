package com.ruoyi.system.service;

import com.ruoyi.system.domain.stock.StockAnalysisResult;

public interface IStockAnalyzerService
{
    StockAnalysisResult analyze(String stockCode);
}
