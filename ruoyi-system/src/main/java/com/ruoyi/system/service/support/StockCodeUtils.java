package com.ruoyi.system.service.support;

import java.util.Locale;
import com.ruoyi.common.exception.ServiceException;

/**
 * 沪深股票及场内基金代码解析工具。
 */
public final class StockCodeUtils
{
    private StockCodeUtils()
    {
    }

    /**
     * 统一为带市场前缀的代码。未提供前缀时，5/6 开头归属上海，0/1/3 开头归属深圳。
     */
    public static String normalizeMarketCode(String input)
    {
        if (input == null || input.trim().isEmpty())
        {
            throw new ServiceException("请输入股票或ETF代码");
        }

        String value = input.trim().toLowerCase(Locale.ROOT);
        if (value.startsWith("sh") || value.startsWith("sz"))
        {
            String code = value.substring(2);
            if (!code.matches("\\d{6}"))
            {
                throw unsupportedCode();
            }
            return value.substring(0, 2) + code;
        }

        if (!value.matches("[01356]\\d{5}"))
        {
            throw unsupportedCode();
        }
        return (value.startsWith("5") || value.startsWith("6") ? "sh" : "sz") + value;
    }

    /**
     * 统一为不带市场前缀的六位代码，便于数据库去重与存储。
     */
    public static String normalizePlainCode(String input)
    {
        return normalizeMarketCode(input).substring(2);
    }

    private static ServiceException unsupportedCode()
    {
        return new ServiceException("代码格式不正确，仅支持沪深A股和场内ETF");
    }
}
