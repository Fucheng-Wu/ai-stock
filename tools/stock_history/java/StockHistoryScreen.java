import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.alibaba.fastjson2.JSON;
import com.alibaba.fastjson2.JSONObject;
import com.ruoyi.system.domain.stock.RuleJudgment;
import com.ruoyi.system.domain.stock.StockKlineData;
import com.ruoyi.system.domain.stock.StockRealtimeData;
import com.ruoyi.system.domain.stock.StrategyReport;
import com.ruoyi.system.service.impl.StockStrategyReportBuilder;
import com.ruoyi.system.service.support.StockMovingAverage;
import com.ruoyi.system.service.support.StockScreenCalculator;

/** Local JSONL adapter; all buy-point judgments come from the production builder. */
public class StockHistoryScreen
{
    public static Map<String, Object> analyze(JSONObject input)
    {
        return StockScreenCalculator.analyze(input.getString("symbol"), input.getString("name"), input.getString("exchange"),
            input.getDoubleValue("rawClose"), input.getList("bars", StockKlineData.class));
    }

    public static void main(String[] args) throws Exception
    {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
             PrintWriter writer = new PrintWriter(new OutputStreamWriter(System.out, StandardCharsets.UTF_8)))
        {
            String line;
            while ((line = reader.readLine()) != null)
            {
                writer.println(JSON.toJSONString(analyze(JSON.parseObject(line))));
            }
            if (writer.checkError()) throw new java.io.IOException("Unable to write screening results");
        }
    }
}
