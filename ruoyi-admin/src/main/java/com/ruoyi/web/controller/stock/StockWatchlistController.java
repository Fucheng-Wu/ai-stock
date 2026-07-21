package com.ruoyi.web.controller.stock;

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
import com.ruoyi.system.domain.stock.StockWatchlist;
import com.ruoyi.system.service.IStockWatchlistService;

@RestController
@RequestMapping("/stock/watchlist")
public class StockWatchlistController extends BaseController
{
    private final IStockWatchlistService watchlistService;

    public StockWatchlistController(IStockWatchlistService watchlistService) { this.watchlistService = watchlistService; }

    @PreAuthorize("@ss.hasPermi('stock:watchlist:list')")
    @GetMapping("/list")
    public AjaxResult list() { return success(watchlistService.list(getUserId())); }

    @PreAuthorize("@ss.hasPermi('stock:watchlist:add')")
    @PostMapping
    public AjaxResult add(@RequestBody StockWatchlist watchlist)
    {
        watchlistService.add(getUserId(), watchlist.getStockCode(), watchlist.getStockName(), getUsername());
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
