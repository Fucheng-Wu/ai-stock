package com.ruoyi.system.service.impl;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import com.ruoyi.system.domain.stock.AnalysisSignal;
import com.ruoyi.system.domain.stock.BuyPointStep;
import com.ruoyi.system.domain.stock.ExitStep;
import com.ruoyi.system.domain.stock.RuleEvidence;
import com.ruoyi.system.domain.stock.RuleJudgment;
import com.ruoyi.system.domain.stock.StockKlineData;
import com.ruoyi.system.domain.stock.StockRealtimeData;
import com.ruoyi.system.domain.stock.StrategyReport;

/** Builds the deterministic, evidence-first 520 strategy report. */
public class StockStrategyReportBuilder
{
    static final String SATISFIED = "SATISFIED";
    static final String NOT_SATISFIED = "NOT_SATISFIED";
    static final String SKIPPED = "SKIPPED";
    static final String INSUFFICIENT = "INSUFFICIENT";

    public StrategyReport build(StockRealtimeData stock, List<StockKlineData> bars)
    {
        StrategyReport report = new StrategyReport();
        RuleJudgment trend = trend(stock);
        BuyPointStep buyPoints = buyPoints(trend, bars);
        report.setTrendStep(trend);
        report.setBuyPointStep(buyPoints);
        report.setPositionStep(position(trend, buyPoints, null));
        report.setSummary(summary(trend, buyPoints));
        return report;
    }

    public void enrichHolding(StrategyReport report, StockRealtimeData stock, List<StockKlineData> bars,
            Map<String, Object> holding)
    {
        if (report == null) return;
        ExitStep exit = exits(stock, bars, holding);
        report.setExitStep(exit);
        report.setPositionStep(position(report.getTrendStep(), report.getBuyPointStep(), new HoldingContext(exit, number(holding, "positionPct"))));
        report.setSummary(report.getPositionStep().getConclusion());
    }

    public AnalysisSignal compatibleSignal(StrategyReport report)
    {
        if (report == null || report.getBuyPointStep() == null)
            return signal("NONE", "数据不足", "LOW", "结构化规则数据不足", "空仓观望");
        BuyPointStep step = report.getBuyPointStep();
        if (hit(step.getGoldenCross())) return from(step.getGoldenCross(), "GOLDEN_CROSS", "HIGH", "3成仓（首次试探）");
        if (hit(step.getRetrace())) return from(step.getRetrace(), "RETRACE", "HIGH", "增加1-2成，总仓不超5成");
        if (hit(step.getConvergence())) return from(step.getConvergence(), "CONVERGENCE", "HIGH", "约4成仓，总仓不超5成");
        RuleJudgment trend = report.getTrendStep();
        String type = trend == null ? "UNKNOWN" : trend.getConclusion();
        return signal("NONE", "无可执行买点", "UP".equals(type) ? "MEDIUM" : "LOW",
                trend == null ? "趋势数据不足" : trend.getReason(),
                report.getPositionStep() == null ? "空仓观望" : report.getPositionStep().getConclusion());
    }

    private RuleJudgment trend(StockRealtimeData stock)
    {
        RuleJudgment rule = new RuleJudgment("TREND_MA20", "第一步：定趋势");
        Double current = stock == null ? null : stock.getMa20();
        Double previous = stock == null ? null : stock.getMa20Prev();
        Double close = stock == null ? null : stock.getCurrentPrice();
        Double change = current == null || previous == null ? null : current - previous;
        Double rate = change == null || previous == 0 ? null : change / previous * 100;
        rule.add(ev("MA20当前值", current, money(current), null, current != null));
        rule.add(ev("MA20前一交易日值", previous, money(previous), null, previous != null));
        rule.add(ev("MA20变化值", change, signed(change), null, change != null));
        rule.add(ev("MA20变化率", rate, pct(rate), "绝对值超过0.1%才判定方向", rate != null));
        rule.add(ev("收盘价与MA20", close, close == null || current == null ? "--" : (close >= current ? "站上" : "跌破"), "收盘价与MA20比较", close != null && current != null));
        if (rate == null)
        {
            finish(rule, INSUFFICIENT, "INSUFFICIENT", "MA20数据不足，不能判断趋势");
        }
        else if (Math.abs(rate) <= 0.1)
        {
            finish(rule, NOT_SATISFIED, "FLAT", "MA20单日变化率绝对值不超过0.1%，趋势走平，买点不可执行");
        }
        else if (rate > 0)
        {
            finish(rule, SATISFIED, "UP", "MA20向上超过0.1%，允许进入第二步寻找买点");
        }
        else
        {
            finish(rule, NOT_SATISFIED, "DOWN", "MA20向下超过0.1%，当前禁止执行买点");
        }
        return rule;
    }

    private BuyPointStep buyPoints(RuleJudgment trend, List<StockKlineData> bars)
    {
        BuyPointStep step = new BuyPointStep();
        RuleJudgment golden = golden(bars);
        RuleJudgment retrace = retrace(bars);
        RuleJudgment convergence = convergence(bars);
        boolean up = trend != null && "UP".equals(trend.getConclusion());
        boolean enough = trend != null && !INSUFFICIENT.equals(trend.getStatus());
        if (!up)
        {
            String reason = enough ? "MA20未向上，保留当前证据但买点不具备执行前提" : "趋势数据不足，保留当前证据但不能执行买点";
            skip(golden, reason); skip(retrace, reason); skip(convergence, reason);
            step.setStatus(enough ? SKIPPED : INSUFFICIENT);
        }
        else
        {
            step.setStatus(SATISFIED);
        }
        step.setGoldenCross(golden);
        step.setRetrace(retrace);
        step.setConvergence(convergence);
        return step;
    }

    private RuleJudgment golden(List<StockKlineData> bars)
    {
        RuleJudgment rule = new RuleJudgment("BUY_GOLDEN_CROSS", "金叉买点");
        StockKlineData current = at(bars, -1), previous = at(bars, -2);
        Double ratio = volumeRatio(current, previous);
        addMaEvidence(rule, previous, current);
        rule.add(ev("当前成交量", volume(current), display(volume(current)), null, current != null));
        rule.add(ev("前一日成交量", volume(previous), display(volume(previous)), null, previous != null));
        rule.add(condition("成交量倍数", ratio, ratio == null ? "--" : format(ratio) + "倍", ">= 1.5倍", ratio != null && ratio >= 1.5));
        if (!maReady(current) || !maReady(previous) || ratio == null)
            return finish(rule, INSUFFICIENT, "数据不足", "金叉或成交量数据不足");
        boolean cross = previous.getMa5() < previous.getMa20() && current.getMa5() >= current.getMa20();
        if (cross && ratio >= 1.5) return finish(rule, SATISFIED, "金叉且量能确认", "MA5上穿MA20且成交量达到前一日1.5倍");
        if (cross) return finish(rule, NOT_SATISFIED, "交叉成立但量能未确认", "均线形成金叉，但成交量未达到1.5倍");
        return finish(rule, NOT_SATISFIED, "未形成有效金叉", "MA5未从MA20下方上穿");
    }

    private RuleJudgment retrace(List<StockKlineData> bars)
    {
        RuleJudgment rule = new RuleJudgment("BUY_RETRACE", "回踩买点");
        StockKlineData current = at(bars, -1);
        boolean recentCross = recentGoldenCross(bars);
        Double close = current == null ? null : current.getClose();
        Double ma20 = current == null ? null : current.getMa20();
        Double distance = close == null || ma20 == null || ma20 == 0 ? null : (close - ma20) / ma20 * 100;
        Double avg = averagePreviousVolume(bars, 4);
        Double shrink = current == null || avg == null || avg == 0 ? null : current.getVolume() / avg;
        boolean priceOk = distance != null && Math.abs(distance) <= 2.0 && close >= ma20 * 0.98;
        boolean volumeOk = shrink != null && shrink <= 0.7;
        rule.add(condition("近期有效金叉", recentCross, recentCross ? "是" : "否", "近10个交易日", recentCross));
        rule.add(ev("当前收盘价", close, money(close), null, close != null));
        rule.add(ev("当前MA20", ma20, money(ma20), null, ma20 != null));
        rule.add(condition("距MA20百分比", distance, pct(distance), "绝对值<=2%，且价格>=MA20的98%", priceOk));
        rule.add(ev("当前成交量", volume(current), display(volume(current)), null, current != null));
        rule.add(condition("缩量比例", shrink, shrink == null ? "--" : format(shrink) + "倍", "<=近期均量0.7倍", volumeOk));
        if (distance == null || shrink == null) return finish(rule, INSUFFICIENT, "数据不足", "回踩价格或量能数据不足");
        if (recentCross && priceOk && volumeOk) return finish(rule, SATISFIED, "有效缩量回踩", "近期金叉后价格回到MA20附近且缩量确认");
        if (recentCross && priceOk) return finish(rule, NOT_SATISFIED, "价格回踩成立但量能未确认", "价格条件满足，缩量洗盘特征较弱");
        return finish(rule, NOT_SATISFIED, "未形成有效回踩", "近期金叉或MA20附近价格条件未满足");
    }

    private RuleJudgment convergence(List<StockKlineData> bars)
    {
        RuleJudgment rule = new RuleJudgment("BUY_CONVERGENCE", "均线粘合发散买点");
        StockKlineData current = at(bars, -1), previous = at(bars, -2);
        int days = convergenceDaysBeforeCurrent(bars);
        Double distance = current == null || !maReady(current) || current.getMa20() == 0 ? null : (current.getMa5() - current.getMa20()) / current.getMa20() * 100;
        Double avg = averagePreviousVolume(bars, 5);
        Double ratio = current == null || avg == null || avg == 0 ? null : current.getVolume() / avg;
        boolean spread = maReady(current) && maReady(previous) && current.getMa5() > current.getMa20() && current.getMa5() > previous.getMa5();
        rule.add(ev("MA5与MA20距离", distance, pct(distance), null, distance != null));
        rule.add(condition("连续粘合交易日", days, days + "日", ">= 5日", days >= 5));
        rule.add(condition("MA5向上发散并高于MA20", spread, spread ? "是" : "否", "MA5>MA20且MA5向上", spread));
        rule.add(ev("当前成交量", volume(current), display(volume(current)), null, current != null));
        rule.add(ev("近期平均成交量", avg, display(avg), null, avg != null));
        rule.add(condition("放量倍数", ratio, ratio == null ? "--" : format(ratio) + "倍", ">= 1.5倍", ratio != null && ratio >= 1.5));
        if (distance == null || ratio == null) return finish(rule, INSUFFICIENT, "数据不足", "粘合发散所需均线或成交量数据不足");
        if (days >= 5 && spread && ratio >= 1.5) return finish(rule, SATISFIED, "粘合后放量向上发散", "连续粘合至少5日，MA5向上突破且放量达到1.5倍");
        return finish(rule, NOT_SATISFIED, "未形成有效粘合发散", "粘合天数、向上发散或量能条件未同时满足");
    }

    private ExitStep exits(StockRealtimeData stock, List<StockKlineData> bars, Map<String, Object> holding)
    {
        StockKlineData current = at(bars, -1), previous = at(bars, -2), before = at(bars, -3);
        Double close = current == null ? (stock == null ? null : stock.getCurrentPrice()) : current.getClose();
        Double ma5 = current == null ? null : current.getMa5(), ma20 = current == null ? null : current.getMa20();
        Double volRatio = volumeRatio(current, previous);
        Double profitPct = number(holding, "profitPct"), profitAmount = number(holding, "profitAmount"), cost = number(holding, "costPrice");
        Double diff5 = close == null || ma5 == null ? null : close - ma5;
        Double diffPct5 = diff5 == null || ma5 == 0 ? null : diff5 / ma5 * 100;

        RuleJudgment shortStop = new RuleJudgment("EXIT_SHORT_STOP", "短线止损");
        shortStop.add(ev("当前收盘价", close, money(close), null, close != null));
        shortStop.add(ev("MA5", ma5, money(ma5), null, ma5 != null));
        shortStop.add(ev("差值", diff5, signed(diff5), "收盘价<MA5触发", diff5 != null));
        shortStop.add(ev("差值比例", diffPct5, pct(diffPct5), null, diffPct5 != null));
        finish(shortStop, diff5 == null ? INSUFFICIENT : diff5 < 0 ? SATISFIED : NOT_SATISFIED,
                diff5 == null ? "数据不足" : diff5 < 0 ? "触发短线止损" : "未触发短线止损",
                diff5 != null && diff5 < 0 ? "收盘价跌破MA5，短线转弱，优先减仓或止损" : "收盘价尚未跌破MA5");

        RuleJudgment trendStop = new RuleJudgment("EXIT_TREND_STOP", "趋势止损");
        trendStop.add(ev("当前收盘价", close, money(close), null, close != null));
        trendStop.add(ev("MA20", ma20, money(ma20), null, ma20 != null));
        trendStop.add(condition("成交量倍数", volRatio, volRatio == null ? "--" : format(volRatio) + "倍", ">=1.5倍", volRatio != null && volRatio >= 1.5));
        boolean trendTriggered = close != null && ma20 != null && volRatio != null && close < ma20 && volRatio >= 1.5;
        finish(trendStop, close == null || ma20 == null || volRatio == null ? INSUFFICIENT : trendTriggered ? SATISFIED : NOT_SATISFIED,
                trendTriggered ? "触发趋势止损" : "未触发趋势止损", trendTriggered ? "生命线被放量跌破，优先级高于买点和止盈" : "未同时满足跌破MA20与1.5倍放量");

        RuleJudgment regular = new RuleJudgment("EXIT_REGULAR_TAKE_PROFIT", "常规止盈");
        regular.add(ev("持仓成本", cost, money(cost), null, cost != null));
        regular.add(ev("当前价", close, money(close), null, close != null));
        regular.add(ev("浮盈亏金额", profitAmount, money(profitAmount), null, profitAmount != null));
        regular.add(condition("浮盈亏比例", profitPct, pct(profitPct), "3%-5%，或>5%但非强势", profitPct != null));

        boolean strongHold = profitPct != null && profitPct > 5 && close != null && ma5 != null && close >= ma5
                && reportTrendUp(stock) && ma20 != null && ma5 >= ma20;
        boolean deathConfirmed = maReady(before) && maReady(previous) && maReady(current)
                && before.getMa5() >= before.getMa20() && previous.getMa5() < previous.getMa20()
                && current.getMa5() < current.getMa20() && close != null && close < current.getMa20();
        boolean regularHit = profitPct != null && profitPct >= 3 && (profitPct <= 5 || !strongHold);
        finish(regular, profitPct == null ? INSUFFICIENT : regularHit ? SATISFIED : NOT_SATISFIED,
                regularHit ? "建议分批止盈" : "未触发常规止盈", regularHit ? "浮盈达到止盈区间，分批兑现利润" : "浮盈未到3%或仍满足强势持有条件");

        RuleJudgment strong = new RuleJudgment("EXIT_STRONG_TAKE_PROFIT", "强势止盈");
        strong.add(condition("浮盈比例", profitPct, pct(profitPct), ">5%", profitPct != null && profitPct > 5));
        strong.add(condition("价格站上MA5", close != null && ma5 != null && close >= ma5, close == null || ma5 == null ? "--" : close >= ma5 ? "是" : "否", "价格>=MA5", close != null && ma5 != null && close >= ma5));
        strong.add(condition("MA20向上", reportTrendUp(stock), reportTrendUp(stock) ? "是" : "否", "MA20向上", reportTrendUp(stock)));
        strong.add(condition("MA5不低于MA20", ma5 != null && ma20 != null && ma5 >= ma20, ma5 == null || ma20 == null ? "--" : ma5 >= ma20 ? "是" : "否", "MA5>=MA20", ma5 != null && ma20 != null && ma5 >= ma20));
        strong.add(condition("死叉清仓确认", deathConfirmed, deathConfirmed ? "是" : "否", "前日死叉且当前未站回MA20", deathConfirmed));
        finish(strong, profitPct == null || close == null || ma5 == null || ma20 == null ? INSUFFICIENT : deathConfirmed || strongHold ? SATISFIED : NOT_SATISFIED,
                deathConfirmed ? "死叉确认，清仓兑现" : strongHold ? "保持强势持有" : "不满足强势持有",
                deathConfirmed ? "趋势确认破坏，执行清仓" : strongHold ? "强势阶段不机械止盈" : "不满足强势持有条件，按常规规则处理");

        ExitStep exit = new ExitStep();
        exit.setShortStop(shortStop); exit.setTrendStop(trendStop); exit.setRegularTakeProfit(regular); exit.setStrongTakeProfit(strong);
        return exit;
    }

    private RuleJudgment position(RuleJudgment trend, BuyPointStep buy, HoldingContext holding)
    {
        RuleJudgment rule = new RuleJudgment("POSITION_ACTION", "第三步：执行与仓位管理");
        Double currentPct = holding == null ? null : holding.positionPct;
        rule.add(ev("当前持仓比例", currentPct, pct(currentPct), "加仓后不超过50%", holding == null || currentPct != null));
        String conclusion;
        String reason;
        if (holding != null && hit(holding.exit.getTrendStop())) { conclusion = "趋势止损，优先减仓或清仓"; reason = "放量跌破MA20，最高优先级"; }
        else if (holding != null && hit(holding.exit.getShortStop())) { conclusion = "短线止损，优先减仓"; reason = "收盘价跌破MA5"; }
        else if (holding != null && "死叉确认，清仓兑现".equals(holding.exit.getStrongTakeProfit().getConclusion())) { conclusion = "死叉确认，清仓兑现"; reason = "趋势破坏已连续确认"; }
        else if (holding != null && hit(holding.exit.getRegularTakeProfit())) { conclusion = "分批止盈"; reason = "浮盈达到规则区间"; }
        else if (trend == null || !"UP".equals(trend.getConclusion())) { conclusion = "空仓观望"; reason = "MA20未向上，买点不可执行"; }
        else if (hit(buy.getGoldenCross())) { conclusion = cap("首次试探约3成仓", currentPct, 30); reason = "金叉且量能确认"; }
        else if (hit(buy.getRetrace())) { conclusion = cap("增加1-2成仓", currentPct, 20); reason = "有效缩量回踩，总仓不得超过50%"; }
        else if (hit(buy.getConvergence())) { conclusion = cap("建议约4成仓", currentPct, 40); reason = "粘合后放量发散，总仓不得超过50%"; }
        else { conclusion = holding == null ? "不追高，保持观望" : "保持原仓位"; reason = "没有有效买点"; }
        finish(rule, SATISFIED, conclusion, reason);
        return rule;
    }

    private String cap(String action, Double currentPct, int target)
    {
        if (currentPct == null) return action + "，总仓不超过50%";
        if (currentPct >= 50) return "当前仓位已达上限，不再加仓";
        double allowed = Math.min(target, Math.max(0, 50 - currentPct));
        return action + "，最多再增加" + format(allowed) + "%（总仓不超过50%）";
    }

    private String summary(RuleJudgment trend, BuyPointStep buy)
    {
        if (trend == null || !"UP".equals(trend.getConclusion())) return "趋势前提不满足，空仓观望";
        if (hit(buy.getGoldenCross())) return "MA20向上，金叉并获量能确认";
        if (hit(buy.getRetrace())) return "MA20向上，出现有效缩量回踩";
        if (hit(buy.getConvergence())) return "MA20向上，均线粘合后放量发散";
        return "MA20向上，但当前无可执行买点";
    }

    private void addMaEvidence(RuleJudgment rule, StockKlineData previous, StockKlineData current)
    {
        rule.add(ev("前一日MA5", previous == null ? null : previous.getMa5(), money(previous == null ? null : previous.getMa5()), null, maReady(previous)));
        rule.add(condition("前一日MA20", previous == null ? null : previous.getMa20(), money(previous == null ? null : previous.getMa20()), "前一日MA5<MA20", maReady(previous) && previous.getMa5() < previous.getMa20()));
        rule.add(ev("当前MA5", current == null ? null : current.getMa5(), money(current == null ? null : current.getMa5()), null, maReady(current)));
        rule.add(condition("当前MA20", current == null ? null : current.getMa20(), money(current == null ? null : current.getMa20()), "当前MA5>=MA20", maReady(current) && current.getMa5() >= current.getMa20()));
    }

    private boolean recentGoldenCross(List<StockKlineData> bars)
    {
        if (bars == null) return false;
        int end = bars.size() - 1;
        for (int i = Math.max(1, end - 10); i < end; i++)
        {
            StockKlineData p = bars.get(i - 1), c = bars.get(i);
            if (maReady(p) && maReady(c) && p.getMa5() < p.getMa20() && c.getMa5() >= c.getMa20()) return true;
        }
        return false;
    }

    private int convergenceDaysBeforeCurrent(List<StockKlineData> bars)
    {
        if (bars == null) return 0;
        int count = 0;
        for (int i = bars.size() - 2; i >= 0; i--)
        {
            StockKlineData bar = bars.get(i);
            if (!maReady(bar) || bar.getMa20() == 0 || Math.abs(bar.getMa5() - bar.getMa20()) / bar.getMa20() > 0.01) break;
            count++;
        }
        return count;
    }

    private Double averagePreviousVolume(List<StockKlineData> bars, int days)
    {
        if (bars == null || bars.size() < 2) return null;
        int end = bars.size() - 2, start = Math.max(0, end - days + 1), count = 0;
        double sum = 0;
        for (int i = start; i <= end; i++) { sum += bars.get(i).getVolume(); count++; }
        return count == 0 ? null : sum / count;
    }

    private Double volumeRatio(StockKlineData current, StockKlineData previous)
    {
        return current == null || previous == null || previous.getVolume() == 0 ? null : (double) current.getVolume() / previous.getVolume();
    }

    private Long volume(StockKlineData bar) { return bar == null ? null : bar.getVolume(); }
    private StockKlineData at(List<StockKlineData> bars, int offset) { int i = bars == null ? -1 : bars.size() + offset; return i < 0 ? null : bars.get(i); }
    private boolean maReady(StockKlineData bar) { return bar != null && bar.getMa5() != null && bar.getMa20() != null; }
    private boolean reportTrendUp(StockRealtimeData stock) { return stock != null && stock.getMa20() != null && stock.getMa20Prev() != null && stock.getMa20Prev() != 0 && (stock.getMa20() - stock.getMa20Prev()) / stock.getMa20Prev() * 100 > 0.1; }
    private boolean hit(RuleJudgment rule) { return rule != null && SATISFIED.equals(rule.getStatus()); }
    private void skip(RuleJudgment rule, String reason) { rule.setStatus(SKIPPED); rule.setConclusion("已跳过"); rule.setReason(reason); }
    private RuleJudgment finish(RuleJudgment rule, String status, String conclusion, String reason) { rule.setStatus(status); rule.setConclusion(conclusion); rule.setReason(reason); return rule; }
    private RuleEvidence ev(String label, Object value, String display, String threshold, boolean available) { return new RuleEvidence(label, value, available ? display : "--", threshold, available ? "PASS" : "INSUFFICIENT"); }
    private RuleEvidence condition(String label, Object value, String display, String threshold, boolean pass) { return new RuleEvidence(label, value, display, threshold, value == null ? "INSUFFICIENT" : pass ? "PASS" : "FAIL"); }
    private String money(Double value) { return value == null ? "--" : format(value) + " 元"; }
    private String signed(Double value) { return value == null ? "--" : (value >= 0 ? "+" : "") + format(value); }
    private String pct(Double value) { return value == null ? "--" : (value >= 0 ? "+" : "") + format(value) + "%"; }
    private String display(Number value) { return value == null ? "--" : format(value.doubleValue()); }
    private String format(double value) { return String.format(java.util.Locale.ROOT, "%.2f", value); }
    private Double number(Map<String, Object> map, String key) { if (map == null || map.get(key) == null) return null; Object v = map.get(key); if (v instanceof BigDecimal) return ((BigDecimal) v).doubleValue(); if (v instanceof Number) return ((Number) v).doubleValue(); try { return Double.valueOf(v.toString()); } catch (Exception e) { return null; } }
    private AnalysisSignal from(RuleJudgment rule, String type, String confidence, String position) { return signal(type, rule.getName(), confidence, rule.getReason(), position); }
    private AnalysisSignal signal(String type, String description, String confidence, String reason, String position) { return new AnalysisSignal(type, description, confidence, reason, position); }

    private static class HoldingContext
    {
        private final ExitStep exit;
        private final Double positionPct;
        private HoldingContext(ExitStep exit, Double positionPct) { this.exit = exit; this.positionPct = positionPct; }
    }
}
