package com.ruoyi.system.service.impl;

import static org.junit.jupiter.api.Assertions.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import com.ruoyi.system.domain.stock.*;

class StockStrategyReportBuilderTest
{
    private final StockStrategyReportBuilder builder = new StockStrategyReportBuilder();

    @Test void flatTrendSkipsAllBuyPointsButKeepsEvidence()
    {
        StrategyReport report = builder.build(stock(10.0, 10.005), bars(8, 10.0, 10.0, 100));
        assertEquals("FLAT", report.getTrendStep().getConclusion());
        assertEquals("SKIPPED", report.getBuyPointStep().getStatus());
        for (RuleJudgment rule : report.getBuyPointStep().getItems()) { assertEquals("SKIPPED", rule.getStatus()); assertFalse(rule.getEvidence().isEmpty()); }
        assertNull(report.getExitStep());
    }

    @Test void missingTrendIsInsufficientInsteadOfFlat()
    {
        StockRealtimeData stock = new StockRealtimeData(); stock.setCurrentPrice(10);
        StrategyReport report = builder.build(stock, bars(8, 10.0, 10.0, 100));
        assertEquals("INSUFFICIENT", report.getTrendStep().getStatus());
        assertEquals("INSUFFICIENT", report.getTrendStep().getConclusion());
    }

    @Test void downwardTrendSkipsBuyPoints()
    {
        StrategyReport report = builder.build(stock(10.2, 10.0), bars(8, 10.0, 10.0, 100));
        assertEquals("DOWN", report.getTrendStep().getConclusion());
        assertEquals("SKIPPED", report.getBuyPointStep().getGoldenCross().getStatus());
    }

    @Test void goldenCrossAcceptsExactOnePointFiveVolumeBoundaryAndDrivesSignal()
    {
        List<StockKlineData> bars = bars(2, 9.8, 10.0, 100);
        bars.get(0).setMa5(9.9); bars.get(1).setMa5(10.1); bars.get(1).setClose(10.2); bars.get(1).setVolume(150);
        StrategyReport report = builder.build(stock(10.0, 10.2), bars);
        assertEquals("SATISFIED", report.getBuyPointStep().getGoldenCross().getStatus());
        assertEquals("GOLDEN_CROSS", builder.compatibleSignal(report).getType());
    }

    @Test void convergenceRequiresFiveCompletedConvergedDays()
    {
        assertEquals("NOT_SATISFIED", builder.build(stock(10.0, 10.2), convergenceBars(4)).getBuyPointStep().getConvergence().getStatus());
        assertEquals("SATISFIED", builder.build(stock(10.0, 10.2), convergenceBars(5)).getBuyPointStep().getConvergence().getStatus());
    }

    @Test void retraceKeepsWeakConclusionWhenPricePassesButVolumeDoesNot()
    {
        List<StockKlineData> bars = retraceBars(71);
        StrategyReport weak = builder.build(stock(10.0, 10.2), bars);
        assertEquals("NOT_SATISFIED", weak.getBuyPointStep().getRetrace().getStatus());
        assertTrue(weak.getBuyPointStep().getRetrace().getConclusion().contains("量能未确认"));

        bars.get(bars.size() - 1).setVolume(70);
        StrategyReport strong = builder.build(stock(10.0, 10.2), bars);
        assertEquals("SATISFIED", strong.getBuyPointStep().getRetrace().getStatus());
    }

    @Test void holdingTrendStopWinsOverProfitAndAdditionalBuying()
    {
        List<StockKlineData> bars = bars(3, 10.0, 10.0, 100);
        bars.get(1).setMa5(10.1);
        StockKlineData current = bars.get(2); current.setClose(9.5); current.setMa5(9.8); current.setVolume(150);
        StrategyReport report = builder.build(stock(10.0, 10.2), bars);
        Map<String, Object> holding = new HashMap<>();
        holding.put("costPrice", 9); holding.put("costAmount", 9000); holding.put("profitAmount", 900); holding.put("profitPct", 10); holding.put("positionPct", 48);
        builder.enrichHolding(report, stock(10.0, 10.2), bars, holding);
        assertEquals("SATISFIED", report.getExitStep().getTrendStop().getStatus());
        assertEquals("趋势止损，优先减仓或清仓", report.getPositionStep().getConclusion());
        assertTrue(report.getPositionStep().getEvidence().get(0).getDisplayValue().contains("48"));
    }

    @Test void regularTakeProfitAppliesAboveFivePercentWhenTrendIsNotStrong()
    {
        List<StockKlineData> bars = bars(3, 9.5, 10.0, 100);
        bars.get(2).setClose(10.1);
        StrategyReport report = builder.build(stock(10.0, 10.2), bars);
        Map<String, Object> holding = holding(6, 20);
        builder.enrichHolding(report, stock(10.0, 10.2), bars, holding);
        assertEquals("SATISFIED", report.getExitStep().getRegularTakeProfit().getStatus());
        assertEquals("分批止盈", report.getPositionStep().getConclusion());
    }

    @Test void confirmedDeathCrossClearsPositionBeforeRegularProfitTaking()
    {
        List<StockKlineData> bars = bars(3, 9.5, 10.0, 100);
        bars.get(0).setMa5(10.1);
        bars.get(1).setMa5(9.9);
        bars.get(2).setMa5(9.5); bars.get(2).setClose(9.7);
        StrategyReport report = builder.build(stock(10.0, 10.2), bars);
        builder.enrichHolding(report, stock(10.0, 10.2), bars, holding(8, 20));
        assertEquals("死叉确认，清仓兑现", report.getPositionStep().getConclusion());
    }

    @Test void addingAdviceNeverExceedsFiftyPercentPosition()
    {
        List<StockKlineData> bars = bars(2, 9.8, 10.0, 100);
        bars.get(0).setMa5(9.9); bars.get(1).setMa5(10.1); bars.get(1).setClose(10.2); bars.get(1).setVolume(150);
        StrategyReport report = builder.build(stock(10.0, 10.2), bars);
        builder.enrichHolding(report, stock(10.0, 10.2), bars, holding(0, 48));
        assertTrue(report.getPositionStep().getConclusion().contains("最多再增加2.00%"));
    }

    private StockRealtimeData stock(double previousMa20, double currentMa20)
    {
        StockRealtimeData stock = new StockRealtimeData(); stock.setCurrentPrice(10.2); stock.setMa5(10.1); stock.setMa5Prev(9.9); stock.setMa20Prev(previousMa20); stock.setMa20(currentMa20); return stock;
    }

    private List<StockKlineData> bars(int count, double ma5, double ma20, long volume)
    {
        List<StockKlineData> result = new ArrayList<>();
        for (int i = 0; i < count; i++) { StockKlineData bar = new StockKlineData(); bar.setClose(ma20); bar.setMa5(ma5); bar.setMa20(ma20); bar.setVolume(volume); result.add(bar); }
        return result;
    }

    private List<StockKlineData> convergenceBars(int days)
    {
        List<StockKlineData> result = bars(days + 2, 10.0, 10.0, 100);
        result.get(0).setMa5(9.0);
        StockKlineData current = result.get(result.size() - 1); current.setMa5(10.2); current.setVolume(150); return result;
    }

    private List<StockKlineData> retraceBars(long currentVolume)
    {
        List<StockKlineData> result = bars(12, 10.1, 10.0, 100);
        result.get(6).setMa5(9.9);
        result.get(7).setMa5(10.1);
        StockKlineData current = result.get(result.size() - 1);
        current.setClose(10.1); current.setVolume(currentVolume);
        return result;
    }

    private Map<String, Object> holding(double profitPct, double positionPct)
    {
        Map<String, Object> result = new HashMap<>();
        result.put("costPrice", 9); result.put("costAmount", 9000); result.put("profitAmount", 900);
        result.put("profitPct", profitPct); result.put("positionPct", positionPct);
        return result;
    }
}
