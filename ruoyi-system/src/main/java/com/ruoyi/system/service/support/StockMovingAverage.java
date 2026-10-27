package com.ruoyi.system.service.support;

import java.util.ArrayList;
import java.util.List;

/** Shared moving averages for online analysis and local historical screening. */
public final class StockMovingAverage
{
    private StockMovingAverage() { }

    public static List<Double> calculate(List<Double> closes, int period)
    {
        if (period < 1) throw new IllegalArgumentException("period must be positive");
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
                for (int j = i - period + 1; j <= i; j++) sum += closes.get(j);
                result.add(Math.round(sum / period * 100.0) / 100.0);
            }
        }
        return result;
    }
}
