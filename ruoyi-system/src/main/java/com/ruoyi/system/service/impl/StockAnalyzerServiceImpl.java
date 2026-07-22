package com.ruoyi.system.service.impl;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestTemplate;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONArray;
import com.alibaba.fastjson2.JSONObject;
import com.ruoyi.system.domain.stock.AnalysisSignal;
import com.ruoyi.system.domain.stock.StockAnalysisResult;
import com.ruoyi.system.domain.stock.StockRealtimeData;
import com.ruoyi.system.service.IStockAnalyzerService;

@Service
public class StockAnalyzerServiceImpl implements IStockAnalyzerService
{
    private static final Logger log = LoggerFactory.getLogger(StockAnalyzerServiceImpl.class);

    private static final String TENCENT_API = "http://qt.gtimg.cn/q=";
    private static final String SINA_KLINE_API = "https://quotes.sina.cn/cn/api/jsonp.php/var_KC_MarketDataService.getKLineData=/KC_MarketDataService.getKLineData?symbol=%s&scale=240&datalen=300";
    private static final String DEEPSEEK_MODEL = "deepseek-chat";
    private static final Charset GBK = Charset.forName("GBK");

    @Autowired
    private RestTemplate restTemplate;

    @Value("${deepseek.api-key:}")
    private String deepseekApiKey;

    @Value("${deepseek.base-url:https://api.deepseek.com/v1/chat/completions}")
    private String deepseekBaseUrl;

    @Override
    public StockAnalysisResult analyze(String stockCode)
    {
        return analyze(stockCode, true);
    }

    @Override
    public StockAnalysisResult analyze(String stockCode, boolean includeAi)
    {
        String code = normalizeCode(stockCode);

        StockRealtimeData stock = fetchRealtimeData(code);
        if (stock == null)
        {
            throw new RuntimeException("无法获取股票实时数据: " + stockCode);
        }

        List<JSONObject> klineData = fetchKlineData(code);
        if (klineData.size() < 20)
        {
            throw new RuntimeException("K线数据不足20条，无法计算均线");
        }

        enrichWithMA(stock, klineData);

        AnalysisSignal signal = detectSignals(stock, klineData);

        String trend = detectTrend20ma(stock);
        String trendDesc = getTrendDesc(trend);

        String aiAdvice = "";
        String aiReason = "";
        String riskLevel = "中";
        if (shouldCallAi(includeAi) && StringUtils.hasText(deepseekApiKey))
        {
            try
            {
                String[] aiResult = callDeepSeek(stock, signal, klineData);
                aiAdvice = aiResult[0];
                aiReason = aiResult[1];
                riskLevel = aiResult[2];
            }
            catch (Exception e)
            {
                log.warn("DeepSeek AI 分析失败: {}", e.getMessage());
                aiAdvice = "AI分析暂不可用";
                aiReason = "调用失败: " + e.getMessage();
                riskLevel = "未知";
            }
        }
        else if (shouldCallAi(includeAi))
        {
            aiAdvice = "未配置 DeepSeek API Key";
            aiReason = "请在 application.yml 中配置 deepseek.api-key";
            riskLevel = "未知";
        }

        StockAnalysisResult result = new StockAnalysisResult();
        result.setStock(stock);
        result.setSignal(signal);
        result.setTrend20ma(trend);
        result.setTrendDesc(trendDesc);
        result.setAiAdvice(aiAdvice);
        result.setAiReason(aiReason);
        result.setRiskLevel(riskLevel);
        return result;
    }

    static boolean shouldCallAi(boolean includeAi)
    {
        return includeAi;
    }

    private String normalizeCode(String code)
    {
        code = code.trim().toLowerCase();
        if (code.startsWith("sh") || code.startsWith("sz"))
        {
            return code;
        }
        if (code.startsWith("6"))
        {
            return "sh" + code;
        }
        else if (code.startsWith("0") || code.startsWith("3"))
        {
            return "sz" + code;
        }
        return code;
    }

    private StockRealtimeData fetchRealtimeData(String code)
    {
        String url = TENCENT_API + code;
        try
        {
            ResponseEntity<byte[]> resp = restTemplate.exchange(url, HttpMethod.GET, null, byte[].class);
            String text = new String(resp.getBody(), GBK).trim();
            if (!text.contains("=\""))
            {
                return null;
            }
            String dataStr = text.split("=\"")[1].replace("\";", "").replace("\"", "");
            String[] fields = dataStr.split("~");
            if (fields.length < 45)
            {
                return null;
            }
            StockRealtimeData stock = new StockRealtimeData();
            stock.setCode(code);
            stock.setName(fields[1]);
            stock.setCurrentPrice(parseDouble(fields[3]));
            stock.setPrevClose(parseDouble(fields[4]));
            stock.setOpenPrice(parseDouble(fields[5]));
            stock.setHigh(parseDouble(fields[33]));
            stock.setLow(parseDouble(fields[34]));
            stock.setVolume(parseLong(fields[36]));
            stock.setAmount(parseDouble(fields[37]));
            stock.setDate(fields.length > 30 ? fields[30] : "");
            stock.setTime(fields.length > 31 ? fields[31] : "");
            return stock;
        }
        catch (Exception e)
        {
            log.warn("腾讯接口获取实时数据失败: {}", e.getMessage());
            return null;
        }
    }

    private List<JSONObject> fetchKlineData(String code)
    {
        String url = String.format(SINA_KLINE_API, code);
        try
        {
            ResponseEntity<String> resp = restTemplate.getForEntity(url, String.class);
            String text = resp.getBody();
            if (text == null) return new ArrayList<>();
            int start = text.indexOf('[');
            int end = text.lastIndexOf(']') + 1;
            if (start == -1 || end <= start) return new ArrayList<>();
            String json = text.substring(start, end);
            return JSONArray.parseArray(json, JSONObject.class);
        }
        catch (Exception e)
        {
            log.warn("新浪K线接口获取失败: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    private void enrichWithMA(StockRealtimeData stock, List<JSONObject> klineData)
    {
        List<Double> closes = new ArrayList<>();
        for (JSONObject k : klineData)
        {
            closes.add(k.getDouble("c"));
        }
        List<Double> ma5List = calcMA(closes, 5);
        List<Double> ma20List = calcMA(closes, 20);

        if (!ma5List.isEmpty() && ma5List.get(ma5List.size() - 1) != null)
            stock.setMa5(ma5List.get(ma5List.size() - 1));
        if (!ma20List.isEmpty() && ma20List.get(ma20List.size() - 1) != null)
            stock.setMa20(ma20List.get(ma20List.size() - 1));
        if (ma5List.size() > 1 && ma5List.get(ma5List.size() - 2) != null)
            stock.setMa5Prev(ma5List.get(ma5List.size() - 2));
        if (ma20List.size() > 1 && ma20List.get(ma20List.size() - 2) != null)
            stock.setMa20Prev(ma20List.get(ma20List.size() - 2));
    }

    private List<Double> calcMA(List<Double> closes, int period)
    {
        List<Double> result = new ArrayList<>();
        for (int i = 0; i < closes.size(); i++)
        {
            if (i < period - 1)
            {
                result.add(null);
            }
            else
            {
                double sum = 0;
                for (int j = i - period + 1; j <= i; j++)
                {
                    sum += closes.get(j);
                }
                result.add(Math.round(sum / period * 100.0) / 100.0);
            }
        }
        return result;
    }

    private String detectTrend20ma(StockRealtimeData stock)
    {
        if (stock.getMa20() == null || stock.getMa20Prev() == null) return "UNKNOWN";
        double diff = stock.getMa20() - stock.getMa20Prev();
        double diffPct = stock.getMa20Prev() != 0 ? Math.abs(diff) / stock.getMa20Prev() * 100 : 0;
        if (diff > 0 && diffPct > 0.1) return "UP";
        if (diff < 0 && diffPct > 0.1) return "DOWN";
        return "FLAT";
    }

    private String getTrendDesc(String trend)
    {
        switch (trend)
        {
            case "UP": return "向上（多头趋势，可操作）";
            case "DOWN": return "向下（空头趋势，禁止操作）";
            case "FLAT": return "走平（震荡市，观望）";
            default: return "未知";
        }
    }

    private AnalysisSignal detectSignals(StockRealtimeData stock, List<JSONObject> klineData)
    {
        AnalysisSignal death = detectDeathCross(stock);
        if (death != null) return death;

        AnalysisSignal golden = detectGoldenCross(stock);
        if (golden != null) return golden;

        AnalysisSignal retrace = detectRetrace(stock, klineData);
        if (retrace != null) return retrace;

        AnalysisSignal convergence = detectConvergence(stock, klineData);
        if (convergence != null) return convergence;

        String trend = detectTrend20ma(stock);
        if ("UP".equals(trend))
        {
            return new AnalysisSignal("NONE", "无明确信号（多头趋势中）", "MEDIUM",
                    String.format("20日线向上(%.2f), 5日线%.2f, 暂无金叉/回踩/粘合信号，持有观望", stock.getMa20(), stock.getMa5()),
                    "持有，不操作");
        }
        else if ("DOWN".equals(trend))
        {
            return new AnalysisSignal("NONE", "无信号（空头趋势，禁止操作）", "HIGH",
                    String.format("20日线向下(%.2f), 所有反弹都是昙花一现，坚决不进场", stock.getMa20()),
                    "空仓观望");
        }
        else
        {
            return new AnalysisSignal("NONE", "无信号（震荡市）", "MEDIUM",
                    "20日线走平，震荡市信号无效，避免频繁操作",
                    "空仓观望");
        }
    }

    private AnalysisSignal detectGoldenCross(StockRealtimeData stock)
    {
        if (stock.getMa5() == null || stock.getMa20() == null
                || stock.getMa5Prev() == null || stock.getMa20Prev() == null)
            return null;

        if (stock.getMa5Prev() < stock.getMa20Prev() && stock.getMa5() >= stock.getMa20())
        {
            String trend = detectTrend20ma(stock);
            if ("UP".equals(trend))
            {
                return new AnalysisSignal("GOLDEN_CROSS", "金叉买点", "HIGH",
                        String.format("5日均线上穿20日均线形成金叉，20日线向上(%.2f > %.2f)，中期多头趋势确认",
                                stock.getMa20(), stock.getMa20Prev()),
                        "3成仓（首次试探）");
            }
            else if ("FLAT".equals(trend))
            {
                return new AnalysisSignal("GOLDEN_CROSS_WEAK", "弱金叉（20日线走平）", "LOW",
                        String.format("5日均线上穿20日均线，但20日线走平(%.2f ≈ %.2f)，震荡市信号可靠性低",
                                stock.getMa20(), stock.getMa20Prev()),
                        "观望，不操作");
            }
        }
        return null;
    }

    private AnalysisSignal detectDeathCross(StockRealtimeData stock)
    {
        if (stock.getMa5() == null || stock.getMa20() == null
                || stock.getMa5Prev() == null || stock.getMa20Prev() == null)
            return null;

        if (stock.getMa5Prev() >= stock.getMa20Prev() && stock.getMa5() < stock.getMa20())
        {
            return new AnalysisSignal("DEATH_CROSS", "死叉卖点", "HIGH",
                    String.format("5日均线下穿20日均线形成死叉(%.2f < %.2f)，趋势转弱",
                            stock.getMa5(), stock.getMa20()),
                    "清仓");
        }
        return null;
    }

    private AnalysisSignal detectRetrace(StockRealtimeData stock, List<JSONObject> klineData)
    {
        if (stock.getMa5() == null || stock.getMa20() == null) return null;
        if (klineData.size() < 10) return null;

        List<Double> closes = new ArrayList<>();
        for (JSONObject k : klineData) closes.add(k.getDouble("c"));
        List<Double> ma5List = calcMA(closes, 5);
        List<Double> ma20List = calcMA(closes, 20);

        boolean hadGoldenCross = false;
        for (int i = Math.max(0, ma5List.size() - 10); i < ma5List.size() - 1; i++)
        {
            if (ma5List.get(i) != null && ma20List.get(i) != null
                    && i > 0 && ma5List.get(i - 1) != null && ma20List.get(i - 1) != null)
            {
                if (ma5List.get(i - 1) < ma20List.get(i - 1) && ma5List.get(i) >= ma20List.get(i))
                {
                    hadGoldenCross = true;
                    break;
                }
            }
        }

        if (!hadGoldenCross) return null;

        double currentClose = klineData.get(klineData.size() - 1).getDouble("c");
        double distanceToMa20 = Math.abs(currentClose - stock.getMa20()) / stock.getMa20() * 100;

        boolean volumeShrink = false;
        if (klineData.size() >= 3)
        {
            long recentVolume = klineData.get(klineData.size() - 1).getLong("v");
            long avgVolume = 0;
            int count = 0;
            for (int i = Math.max(0, klineData.size() - 5); i < klineData.size() - 1; i++)
            {
                avgVolume += klineData.get(i).getLong("v");
                count++;
            }
            avgVolume = count > 0 ? avgVolume / count : 0;
            volumeShrink = avgVolume > 0 && recentVolume < avgVolume * 0.7;
        }

        if (distanceToMa20 < 2.0 && currentClose >= stock.getMa20() * 0.98)
        {
            if (volumeShrink)
            {
                return new AnalysisSignal("RETRACE", "回踩买点（缩量洗盘）", "HIGH",
                        String.format("金叉后股价回踩20日线附近(%.2f vs MA20=%.2f)，缩量，主力洗盘概率大",
                                currentClose, stock.getMa20()),
                        "2成仓（二次加仓，总仓不超5成）");
            }
            else
            {
                return new AnalysisSignal("RETRACE", "回踩买点", "MEDIUM",
                        String.format("金叉后股价回踩20日线附近(%.2f vs MA20=%.2f)",
                                currentClose, stock.getMa20()),
                        "1-2成仓试探");
            }
        }
        return null;
    }

    private AnalysisSignal detectConvergence(StockRealtimeData stock, List<JSONObject> klineData)
    {
        if (klineData.size() < 10) return null;

        List<Double> closes = new ArrayList<>();
        for (JSONObject k : klineData) closes.add(k.getDouble("c"));
        List<Double> ma5List = calcMA(closes, 5);
        List<Double> ma20List = calcMA(closes, 20);

        int convergenceDays = 0;
        for (int i = Math.max(0, ma5List.size() - 5); i < ma5List.size(); i++)
        {
            if (ma5List.get(i) != null && ma20List.get(i) != null)
            {
                double diffPct = Math.abs(ma5List.get(i) - ma20List.get(i)) / ma20List.get(i) * 100;
                if (diffPct < 1.0) convergenceDays++;
            }
        }

        if (convergenceDays >= 3 && klineData.size() >= 2)
        {
            long todayVol = klineData.get(klineData.size() - 1).getLong("v");
            long avgVol = 0;
            int count = 0;
            for (int i = Math.max(0, klineData.size() - 6); i < klineData.size() - 1; i++)
            {
                avgVol += klineData.get(i).getLong("v");
                count++;
            }
            avgVol = count > 0 ? avgVol / count : 0;

            if (avgVol > 0 && todayVol > avgVol * 1.5
                    && stock.getMa5() != null && stock.getMa20() != null
                    && stock.getMa5() > stock.getMa20())
            {
                return new AnalysisSignal("CONVERGENCE", "均线粘合发散买点", "HIGH",
                        String.format("5日/20日均线粘合%d天后放量突破，今日放量%.1f倍，主力吸筹完毕开始拉升",
                                convergenceDays, (double) todayVol / avgVol),
                        "4成仓，快进快出");
            }
        }
        return null;
    }

    private String[] callDeepSeek(StockRealtimeData stock, AnalysisSignal signal, List<JSONObject> klineData)
    {
        String trend = detectTrend20ma(stock);
        String trendDesc = getTrendDesc(trend);

        StringBuilder klineSummary = new StringBuilder();
        int start = Math.max(0, klineData.size() - 5);
        for (int i = start; i < klineData.size(); i++)
        {
            JSONObject k = klineData.get(i);
            klineSummary.append(String.format("  %s: 开%s 收%s 高%s 低%s 量%s\n",
                    k.getString("d"), k.getString("o"), k.getString("c"),
                    k.getString("h"), k.getString("l"), k.getString("v")));
        }

        String prompt = String.format(
                "你是一位资深A股技术分析专家，精通520均线战法。请基于以下数据给出专业的股票分析和操作建议。\n\n" +
                "## 股票基本信息\n" +
                "- 股票名称: %s (%s)\n" +
                "- 当前价格: %.2f 元\n" +
                "- 今日涨跌: %+.2f 元 (%+.2f%%)\n" +
                "- 今日开盘: %.2f 元\n" +
                "- 今日最高: %.2f 元\n" +
                "- 今日最低: %.2f 元\n" +
                "- 成交量: %d 手\n" +
                "- 成交额: %.0f 元\n\n" +
                "## 520均线数据\n" +
                "- 5日均线(MA5): %s 元\n" +
                "- 20日均线(MA20): %s 元\n" +
                "- 20日均线趋势: %s (前值: %s)\n" +
                "- 5日均线前值: %s\n\n" +
                "## 最近5日K线\n%s" +
                "## 系统检测到的信号\n" +
                "- 信号类型: %s\n" +
                "- 信号描述: %s\n" +
                "- 置信度: %s\n" +
                "- 系统理由: %s\n" +
                "- 建议仓位: %s\n\n" +
                "## 请你输出（请用中文，格式如下，不要多余内容）\n" +
                "**AI操作建议**: [买入/持有/观望/卖出/止损，一句话]\n\n" +
                "**AI分析理由**: [详细分析，包括趋势判断、信号解读、量价关系、风险点等，200字以内]\n\n" +
                "**风险等级**: [低/中/高]",
                stock.getName(), stock.getCode(),
                stock.getCurrentPrice(), stock.getChangeAmt(), stock.getChangePct(),
                stock.getOpenPrice(), stock.getHigh(), stock.getLow(),
                stock.getVolume(), stock.getAmount(),
                stock.getMa5() != null ? String.format("%.2f", stock.getMa5()) : "暂无",
                stock.getMa20() != null ? String.format("%.2f", stock.getMa20()) : "暂无",
                trendDesc, stock.getMa20Prev() != null ? String.format("%.2f", stock.getMa20Prev()) : "暂无",
                stock.getMa5Prev() != null ? String.format("%.2f", stock.getMa5Prev()) : "暂无",
                klineSummary.toString(),
                signal.getType(), signal.getDescription(), signal.getConfidence(),
                signal.getReason(), signal.getSuggestedPosition()
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(deepseekApiKey);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", DEEPSEEK_MODEL);

        List<Map<String, String>> messages = new ArrayList<>();
        Map<String, String> systemMsg = new HashMap<>();
        systemMsg.put("role", "system");
        systemMsg.put("content", "你是一位专业的A股技术分析专家，精通均线战法，分析简洁有力，直击要害。");
        messages.add(systemMsg);

        Map<String, String> userMsg = new HashMap<>();
        userMsg.put("role", "user");
        userMsg.put("content", prompt);
        messages.add(userMsg);

        requestBody.put("messages", messages);
        requestBody.put("temperature", 0.3);
        requestBody.put("max_tokens", 800);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);

        ResponseEntity<Map> response = restTemplate.postForEntity(deepseekBaseUrl, entity, Map.class);

        if (response.getStatusCode() != HttpStatus.OK)
        {
            return new String[]{"API调用失败", "状态码: " + response.getStatusCode(), "未知"};
        }

        Map<String, Object> body = response.getBody();
        if (body == null || !body.containsKey("choices"))
        {
            return new String[]{"API返回异常", "响应体不含choices", "未知"};
        }

        List<Map<String, Object>> choices = (List<Map<String, Object>>) body.get("choices");
        if (choices.isEmpty())
        {
            return new String[]{"API返回异常", "choices为空", "未知"};
        }

        Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
        String content = (String) message.get("content");
        if (content == null) content = "";

        String advice = extractSection(content, "AI操作建议");
        String reason = extractSection(content, "AI分析理由");
        String risk = extractSection(content, "风险等级");

        if (advice.isEmpty()) advice = content.length() > 100 ? content.substring(0, 100) : content;
        if (reason.isEmpty()) reason = content;
        if (risk.isEmpty()) risk = "中";

        return new String[]{advice, reason, risk};
    }

    private String extractSection(String text, String sectionName)
    {
        String[] patterns = {
                String.format("\\*\\*%s\\*\\*\\s*[:：]\\s*(.+?)(?=\\n\\*\\*|$)", sectionName),
                String.format("%s\\s*[:：]\\s*(.+?)(?=\\n|$)", sectionName)
        };
        for (String pattern : patterns)
        {
            java.util.regex.Pattern p = java.util.regex.Pattern.compile(pattern, java.util.regex.Pattern.DOTALL);
            java.util.regex.Matcher m = p.matcher(text);
            if (m.find())
            {
                return m.group(1).trim();
            }
        }
        return "";
    }

    private double parseDouble(String s)
    {
        try { return Double.parseDouble(s); } catch (Exception e) { return 0.0; }
    }

    private long parseLong(String s)
    {
        try { return Long.parseLong(s); } catch (Exception e) { return 0L; }
    }
}
