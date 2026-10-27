package com.ruoyi.web.controller.stock;

import java.time.LocalDate;
import java.util.Map;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import com.ruoyi.common.core.controller.BaseController;
import com.ruoyi.common.core.domain.AjaxResult;
import com.ruoyi.system.service.support.StockMarketRepository;

@RestController
@RequestMapping("/stock/screener")
public class StockScreenerController extends BaseController
{
    private final StockMarketRepository repository;
    public StockScreenerController(StockMarketRepository repository) { this.repository = repository; }

    @PreAuthorize("@ss.hasPermi('stock:analyzer:analyze')")
    @GetMapping("/results")
    public AjaxResult results(@RequestParam(required=false) String snapshotId,
        @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate tradeDate,
        @RequestParam(defaultValue="ALL") String signal, @RequestParam(defaultValue="ALL") String exchange,
        @RequestParam(defaultValue="") String keyword, @RequestParam(defaultValue="false") boolean excludeST,
        @RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="10") int pageSize)
    {
        return success(repository.query(snapshotId, tradeDate, signal, exchange, keyword, excludeST, page, pageSize));
    }

    @PreAuthorize("@ss.hasPermi('stock:analyzer:analyze')")
    @GetMapping("/detail")
    public AjaxResult detail(@RequestParam String stockCode, @RequestParam(required=false) String snapshotId,
        @RequestParam(required=false) @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate tradeDate)
    { return success(repository.detail(stockCode, snapshotId, tradeDate)); }
}
