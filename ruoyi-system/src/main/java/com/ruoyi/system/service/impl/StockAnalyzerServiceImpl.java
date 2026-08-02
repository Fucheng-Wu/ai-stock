package com.ruoyi.system.service.impl;

import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
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
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.system.domain.stock.AnalysisSignal;
import com.ruoyi.system.domain.stock.StockAnalysisResult;
import com.ruoyi.system.domain.stock.StockKlineData;
import com.ruoyi.system.domain.stock.StockRealtimeData;
import com.ruoyi.system.domain.stock.StrategyReport;
import com.ruoyi.system.service.ISysConfigService;
import com.ruoyi.system.service.IStockAnalyzerService;
import com.ruoyi.system.service.support.StockConfigKeys;
import com.ruoyi.system.service.support.StockCodeUtils;

@Service
public class StockAnalyzerServiceImpl implements IStockAnalyzerService
{
    private static final Logger log = LoggerFactory.getLogger(StockAnalyzerServiceImpl.class);

    private static final String TENCENT_API = "http://qt.gtimg.cn/q=";
    private static final String SINA_KLINE_API = "https://quotes.sina.cn/cn/api/jsonp.php/var_KC_MarketDataService.getKLineData=/KC_MarketDataService.getKLineData?symbol=%s&scale=240&datalen=300";
    private static final String DEEPSEEK_MODEL = "deepseek-chat";
    private static final Charset GBK = Charset.forName("GBK");
    private static final int KLINE_DISPLAY_DAYS = 60;
    private final StockStrategyReportBuilder strategyReportBuilder = new StockStrategyReportBuilder();

    @Autowired
    private RestTemplate restTemplate;

    @Autowired
    private ISysConfigService configService;

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

        List<StockKlineData> chartData = buildKlineChartData(klineData);
        StrategyReport strategyReport = strategyReportBuilder.build(stock, chartData);
        AnalysisSignal signal = strategyReportBuilder.compatibleSignal(strategyReport);

        String trend = strategyReport.getTrendStep().getConclusion();
        String trendDesc = getTrendDesc(trend);

        StockAnalysisResult result = new StockAnalysisResult();
        result.setStock(stock);
        result.setSignal(signal);
        result.setTrend20ma(trend);
        result.setTrendDesc(trendDesc);
        result.setAiAdvice("");
        result.setAiReason("");
        result.setRiskLevel("中");
        result.setKlineData(chartData);
        result.setStrategyReport(strategyReport);
        Map<String, Object> indicators = new HashMap<>();
        JSONObject latest = klineData.get(klineData.size() - 1);
        JSONObject previous = klineData.get(klineData.size() - 2);
        double currentVolume = parseDouble(latest.getString("v"));
        double previousVolume = parseDouble(previous.getString("v"));
        indicators.put("previousClose", stock.getPrevClose());
        indicators.put("previousVolume", previousVolume);
        indicators.put("volumeRatio", previousVolume == 0 ? null : currentVolume / previousVolume);
        indicators.put("contractionRatio", previousVolume == 0 ? null : (previousVolume - currentVolume) / previousVolume);
        indicators.put("priceVsMa5", stock.getCurrentPrice() >= stock.getMa5() ? "站上" : "跌破");
        indicators.put("priceVsMa20", stock.getCurrentPrice() >= stock.getMa20() ? "站上" : "跌破");
        double rangeHigh = Double.NEGATIVE_INFINITY, rangeLow = Double.POSITIVE_INFINITY;
        int convergenceDays = 0;
        for (int i = Math.max(0, klineData.size() - 20); i < klineData.size(); i++) {
            JSONObject bar = klineData.get(i); rangeHigh = Math.max(rangeHigh, parseDouble(bar.getString("h"))); rangeLow = Math.min(rangeLow, parseDouble(bar.getString("l")));
        }
        for (int i = klineData.size() - 1; i >= 0; i--) { double ma5 = calculateMA(klineData, i, 5); double ma20 = calculateMA(klineData, i, 20); if (ma20 != 0 && Math.abs(ma5 - ma20) / ma20 <= 0.01) convergenceDays++; else break; }
        indicators.put("rangeHigh", rangeHigh); indicators.put("rangeLow", rangeLow); indicators.put("convergenceDays", convergenceDays); indicators.put("indexTrend", "上证指数趋势待接入"); indicators.put("sectorTrend", "暂未接入");
        result.setIndicators(indicators);
        if (includeAi) applyAi(result);
        return result;
    }

    @Override
    public StockAnalysisResult completeHoldingAnalysis(StockAnalysisResult result, Map<String, Object> holding, boolean includeAi)
    {
        if (result == null) throw new ServiceException("分析结果不能为空");
        result.setHolding(holding);
        strategyReportBuilder.enrichHolding(result.getStrategyReport(), result.getStock(), result.getKlineData(), holding);
        result.setSignal(strategyReportBuilder.compatibleSignal(result.getStrategyReport()));
        if (includeAi) applyAi(result);
        return result;
    }

    private void applyAi(StockAnalysisResult result)
    {
        String apiKey = resolveDeepseekApiKey();
        if (!StringUtils.hasText(apiKey))
        {
            result.setAiAdvice("未配置 DeepSeek API Key");
            result.setAiReason("规则报告已生成；请在系统管理 → 参数设置中配置 stock.deepseek.apiKey");
            result.setRiskLevel("未知");
            return;
        }
        try
        {
            String[] aiResult = callDeepSeek(result, apiKey);
            result.setAiAdvice(aiResult[0]);
            result.setAiReason(aiResult[1]);
            result.setRiskLevel(aiResult[2]);
        }
        catch (Exception e)
        {
            log.warn("DeepSeek AI 分析失败: {}", e.getMessage());
            result.setAiAdvice("AI分析暂不可用");
            result.setAiReason("调用失败；结构化规则报告不受影响: " + e.getMessage());
            result.setRiskLevel("未知");
        }
    }

    String resolveDeepseekApiKey()
    {
        try
        {
            if (configService != null)
            {
                String configuredKey = configService.selectConfigByKey(StockConfigKeys.DEEPSEEK_API_KEY);
                if (StringUtils.hasText(configuredKey))
                {
                    return configuredKey.trim();
                }
            }
        }
        catch (Exception e)
        {
            log.warn("读取若依参数 {} 失败，将使用 application.yml 回退配置: {}",
                    StockConfigKeys.DEEPSEEK_API_KEY, e.getMessage());
        }
        return StringUtils.hasText(deepseekApiKey) ? deepseekApiKey.trim() : "";
    }

    @Override
    public String resolveStockName(String stockCode)
    {
        if (!StringUtils.hasText(stockCode))
        {
            throw new ServiceException("请输入股票代码");
        }
        String code = normalizeCode(stockCode);
        StockRealtimeData stock = fetchRealtimeData(code);
        if (stock == null || !StringUtils.hasText(stock.getName()))
        {
            throw new ServiceException("无法识别股票代码，请检查后重试");
        }
        return stock.getName();
    }

    static boolean shouldCallAi(boolean includeAi)
    {
        return includeAi;
    }

    String normalizeCode(String code)
    {
        return StockCodeUtils.normalizeMarketCode(code);
    }

    private StockRealtimeData fetchRealtimeData(String code)
    {
        String url = TENCENT_API + code;
        try
        {
            ResponseEntity<byte[]> resp = restTemplate.exchange(url, HttpMethod.GET, null, byte[].class);
            String text = new String(resp.getBody(), GBK).trim();
            return parseTencentResponse(code, text);
        }
        catch (Exception e)
        {
            log.warn("腾讯接口获取实时数据失败: {}", e.getMessage());
            return null;
        }
    }

    StockRealtimeData parseTencentResponse(String code, String text)
    {
        if (!StringUtils.hasText(text) || !text.contains("=\""))
        {
            return null;
        }
        String dataStr = text.split("=\"", 2)[1].replace("\";", "").replace("\"", "");
        String[] fields = dataStr.split("~", -1);
        if (fields.length < 45 || !StringUtils.hasText(fields[1]))
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
        stock.setDate(fields[30]);
        stock.setTime(fields[31]);
        return stock;
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

    List<StockKlineData> buildKlineChartData(List<JSONObject> bars)
    {
        List<StockKlineData> validBars = new ArrayList<>();
        if (bars == null)
        {
            return validBars;
        }

        for (JSONObject bar : bars)
        {
            if (bar == null)
            {
                continue;
            }
            String date = readBarValue(bar, "day", "d");
            Double open = parseKlineDouble(readBarValue(bar, "open", "o"));
            Double close = parseKlineDouble(readBarValue(bar, "close", "c"));
            Double high = parseKlineDouble(readBarValue(bar, "high", "h"));
            Double low = parseKlineDouble(readBarValue(bar, "low", "l"));
            if (!isValidKlineDate(date) || open == null || close == null || high == null || low == null)
            {
                continue;
            }

            StockKlineData kline = new StockKlineData();
            kline.setDate(date.trim());
            kline.setOpen(open);
            kline.setClose(close);
            kline.setHigh(high);
            kline.setLow(low);
            Long volume = parseKlineLong(readBarValue(bar, "volume", "v"));
            kline.setVolume(volume == null ? 0L : volume);
            validBars.add(kline);
        }

        validBars.sort(Comparator.comparing(StockKlineData::getDate));
        List<Double> closes = new ArrayList<>();
        for (StockKlineData kline : validBars)
        {
            closes.add(kline.getClose());
        }
        List<Double> ma5 = calcMA(closes, 5);
        List<Double> ma10 = calcMA(closes, 10);
        List<Double> ma20 = calcMA(closes, 20);
        for (int i = 0; i < validBars.size(); i++)
        {
            StockKlineData kline = validBars.get(i);
            kline.setMa5(ma5.get(i));
            kline.setMa10(ma10.get(i));
            kline.setMa20(ma20.get(i));
        }

        int displayStart = Math.max(0, validBars.size() - KLINE_DISPLAY_DAYS);
        return new ArrayList<>(validBars.subList(displayStart, validBars.size()));
    }

    private String readBarValue(JSONObject bar, String longKey, String shortKey)
    {
        String value = bar.getString(longKey);
        return StringUtils.hasText(value) ? value : bar.getString(shortKey);
    }

    private boolean isValidKlineDate(String date)
    {
        if (!StringUtils.hasText(date))
        {
            return false;
        }
        try
        {
            LocalDate.parse(date.trim());
            return true;
        }
        catch (Exception e)
        {
            return false;
        }
    }

    private Double parseKlineDouble(String value)
    {
        try
        {
            double parsed = Double.parseDouble(value);
            return Double.isFinite(parsed) ? parsed : null;
        }
        catch (Exception e)
        {
            return null;
        }
    }

    private Long parseKlineLong(String value)
    {
        try
        {
            return Long.parseLong(value);
        }
        catch (Exception e)
        {
            return null;
        }
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

    private String[] callDeepSeek(StockAnalysisResult result, String apiKey)
    {
        String prompt = String.format(
                "你是一位资深A股技术分析专家。规则事实已由后端确定，不得改写。\n\n" +
                "## 股票\n%s\n\n" +
                "## 持仓数据（非持仓分析时为空）\n%s\n\n" +
                "## 520三步走结构化规则报告（含实际值、阈值、状态、原因、仓位；持仓分析时含成本、盈亏和止损止盈）\n%s\n\n" +
                "## 请你只输出（中文，不要重新判定规则）\n" +
                "**AI操作建议**: [买入/持有/观望/卖出/止损，一句话]\n\n" +
                "**AI分析理由**: [详细分析，包括趋势判断、信号解读、量价关系、风险点等，200字以内]\n\n" +
                "**风险等级**: [低/中/高]",
                JSON.toJSONString(result.getStock()), JSON.toJSONString(result.getHolding()), JSON.toJSONString(result.getStrategyReport())
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.setBearerAuth(apiKey);

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

    private double calculateMA(List<JSONObject> bars, int end, int days)
    {
        if (end < days - 1) return 0;
        double sum = 0;
        for (int i = end - days + 1; i <= end; i++) sum += parseDouble(bars.get(i).getString("c"));
        return sum / days;
    }

    private long parseLong(String s)
    {
        try { return Long.parseLong(s); } catch (Exception e) { return 0L; }
    }
}
