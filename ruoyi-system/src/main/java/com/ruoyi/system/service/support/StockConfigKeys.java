package com.ruoyi.system.service.support;

/**
 * 股票分析系统使用的若依参数键。
 */
public final class StockConfigKeys
{
    public static final String DEEPSEEK_API_KEY = "stock.deepseek.apiKey";

    private StockConfigKeys()
    {
    }

    public static boolean isSensitive(String configKey)
    {
        return DEEPSEEK_API_KEY.equals(configKey);
    }
}
