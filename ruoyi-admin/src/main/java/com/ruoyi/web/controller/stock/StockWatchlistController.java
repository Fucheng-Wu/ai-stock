package com.ruoyi.web.controller.stock;

import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;
import com.ruoyi.common.core.controller.BaseController;
import com.ruoyi.common.core.domain.AjaxResult;
import com.ruoyi.system.domain.stock.StockAnalysisResult;
import com.ruoyi.system.domain.stock.StockWatchlist;
import com.ruoyi.system.service.IStockAnalyzerService;
import com.ruoyi.system.service.IStockWatchlistAnalysisSnapshotService;
import com.ruoyi.system.service.IStockWatchlistService;

@RestController
@RequestMapping("/stock/watchlist")
public class StockWatchlistController extends BaseController
{
    private final IStockWatchlistService watchlistService;
    private final IStockAnalyzerService stockAnalyzerService;
    private final IStockWatchlistAnalysisSnapshotService snapshotService;

    public StockWatchlistController(IStockWatchlistService watchlistService,
            IStockAnalyzerService stockAnalyzerService,
            IStockWatchlistAnalysisSnapshotService snapshotService)
    {
        this.watchlistService = watchlistService;
        this.stockAnalyzerService = stockAnalyzerService;
        this.snapshotService = snapshotService;
    }

    @PreAuthorize("@ss.hasPermi('stock:watchlist:list')")
    @GetMapping("/list")
    public AjaxResult list() { return success(watchlistService.list(getUserId())); }

    @PreAuthorize("@ss.hasPermi('stock:watchlist:list')")
    @GetMapping("/{watchlistId}/analysis")
    public AjaxResult analysis(@PathVariable Long watchlistId)
    {
        Long userId = getUserId();
        watchlistService.get(userId, watchlistId);
        return success(snapshotService.get(userId, watchlistId));
    }

    @PreAuthorize("@ss.hasPermi('stock:analyzer:analyze')")
    @PostMapping("/{watchlistId}/analyze")
    public AjaxResult analyze(@PathVariable Long watchlistId,
            @RequestBody(required = false) Map<String, Boolean> body)
    {
        Long userId = getUserId();
        boolean includeAi = body != null && Boolean.TRUE.equals(body.get("includeAi"));
        StockWatchlist watchlist = watchlistService.get(userId, watchlistId);
        StockAnalysisResult result = stockAnalyzerService.analyze(watchlist.getStockCode(), includeAi);
        if (!includeAi)
        {
            StockAnalysisResult previous = snapshotService.get(userId, watchlistId);
            if (previous != null)
            {
                result.setAiAdvice(previous.getAiAdvice());
                result.setAiReason(previous.getAiReason());
                result.setRiskLevel(previous.getRiskLevel());
            }
        }
        snapshotService.save(userId, watchlistId, result);
        return success(result);
    }

    @PreAuthorize("@ss.hasPermi('stock:watchlist:add')")
    @PostMapping
    public AjaxResult add(@RequestBody StockWatchlist watchlist)
    {
        String stockName = stockAnalyzerService.resolveStockName(watchlist.getStockCode());
        watchlistService.add(getUserId(), watchlist.getStockCode(), stockName, getUsername());
        return success();
    }

    @PreAuthorize("@ss.hasPermi('stock:watchlist:remove')")
    @DeleteMapping("/{watchlistId}")
    public AjaxResult remove(@PathVariable Long watchlistId)
    {
        watchlistService.remove(getUserId(), watchlistId);
        return success();
    }
}
