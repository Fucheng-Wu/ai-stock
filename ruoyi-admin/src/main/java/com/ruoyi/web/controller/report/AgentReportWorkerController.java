package com.ruoyi.web.controller.report;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.*;
import java.util.function.Supplier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import com.ruoyi.common.annotation.Anonymous;
import com.ruoyi.common.core.domain.AjaxResult;
import com.ruoyi.common.core.domain.entity.SysUser;
import com.ruoyi.common.core.domain.model.LoginUser;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.framework.web.service.SysPermissionService;
import com.ruoyi.system.service.ISysUserService;
import com.ruoyi.system.service.report.AgentReportService;
import com.ruoyi.web.controller.stock.*;

/** Separate service authentication; no saved browser tokens and no general user impersonation endpoint. */
@Anonymous
@RestController
@RequestMapping("/agent/report-worker")
public class AgentReportWorkerController
{
    private static final Set<String> READ_PERMISSIONS = Set.of("agent:chat:use","agent:report:list",
        "stock:analyzer:analyze","stock:position:list","stock:watchlist:list");
    private final AgentReportService reports;
    private final ISysUserService users;
    private final SysPermissionService permissions;
    private final StockAnalyzerController analyzer;
    private final StockPositionController positions;
    private final StockWatchlistController watchlist;
    private final StockScreenerController screener;
    @Value("${agent.report-worker-key:}") private String workerKey;

    public AgentReportWorkerController(AgentReportService reports, ISysUserService users, SysPermissionService permissions,
        StockAnalyzerController analyzer, StockPositionController positions, StockWatchlistController watchlist, StockScreenerController screener)
    { this.reports=reports; this.users=users; this.permissions=permissions; this.analyzer=analyzer; this.positions=positions; this.watchlist=watchlist; this.screener=screener; }

    private void authenticate(String key)
    {
        if (workerKey == null || workerKey.length() < 32 || key == null
            || !MessageDigest.isEqual(workerKey.getBytes(StandardCharsets.UTF_8),key.getBytes(StandardCharsets.UTF_8)))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"报告执行器认证失败");
        reports.workerContact();
    }

    public record WorkerInput(String runId, String leaseToken, String requiredPermission, String path,
        Map<String,Object> body, String content, String error) {}

    @PostMapping("/claim")
    public AjaxResult claim(@RequestHeader(value="X-Report-Worker-Key",required=false) String key)
    { authenticate(key); AjaxResult result=AjaxResult.success(); result.put("data",reports.claim()); return result; }

    private <T> T asOwner(WorkerInput input, Supplier<T> action)
    {
        Long userId = reports.workerOwner(input.runId(),input.leaseToken());
        SysUser user = users.selectUserById(userId);
        if (user == null || !"0".equals(user.getStatus()) || !"0".equals(user.getDelFlag()))
            throw new ServiceException("任务所有者已被停用或删除");
        Set<String> actual = permissions.getMenuPermission(user);
        if (!actual.contains("*:*:*") && (!actual.contains("agent:chat:use") || !actual.contains("agent:report:list")))
            throw new ServiceException("任务所有者已失去Agent或报告中心权限");
        Set<String> allowed = new HashSet<>(READ_PERMISSIONS);
        if (!actual.contains("*:*:*")) allowed.retainAll(actual);
        LoginUser login = new LoginUser(userId,user.getDeptId(),user,allowed);
        SecurityContext previous = SecurityContextHolder.getContext();
        SecurityContext current = SecurityContextHolder.createEmptyContext();
        current.setAuthentication(new UsernamePasswordAuthenticationToken(login,null,login.getAuthorities()));
        SecurityContextHolder.setContext(current);
        try { return action.get(); }
        finally { SecurityContextHolder.setContext(previous); }
    }

    @PostMapping("/authorize")
    public AjaxResult authorize(@RequestHeader(value="X-Report-Worker-Key",required=false) String key, @RequestBody WorkerInput input)
    {
        authenticate(key);
        return asOwner(input,() -> {
            LoginUser login=(LoginUser)SecurityContextHolder.getContext().getAuthentication().getPrincipal();
            if (!READ_PERMISSIONS.contains(input.requiredPermission()) || !login.getPermissions().contains(input.requiredPermission()))
                throw new ServiceException("报告执行缺少权限："+input.requiredPermission());
            return AjaxResult.success(Map.of("authorized",true));
        });
    }

    @PostMapping("/data")
    public AjaxResult data(@RequestHeader(value="X-Report-Worker-Key",required=false) String key, @RequestBody WorkerInput input)
    { authenticate(key); return asOwner(input,() -> read(input)); }

    /** Explicit dispatch only. Never forward model-supplied URLs or arbitrary methods to the backend. */
    private AjaxResult read(WorkerInput input)
    {
        URI uri;
        try { uri=URI.create(input.path()); } catch (Exception e) { throw new ServiceException("报告数据路径无效"); }
        if (uri.isAbsolute() || uri.getRawAuthority()!=null || uri.getFragment()!=null) throw new ServiceException("报告数据路径无效");
        String path=uri.getPath();
        String required="/stock/position/list".equals(path)?"stock:position:list"
            :"/stock/watchlist/list".equals(path)?"stock:watchlist:list":"stock:analyzer:analyze";
        LoginUser login=(LoginUser)SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        if (!login.getPermissions().contains(required)) throw new ServiceException("报告执行缺少权限："+required);
        Map<String,String> q=new HashMap<>();
        if (uri.getRawQuery()!=null) for (String part:uri.getRawQuery().split("&"))
        {
            String[] pair=part.split("=",2);
            q.put(URLDecoder.decode(pair[0],StandardCharsets.UTF_8),pair.length<2?"":URLDecoder.decode(pair[1],StandardCharsets.UTF_8));
        }
        if ("/stock/position/list".equals(path)) return positions.list();
        if ("/stock/watchlist/list".equals(path)) return watchlist.list();
        if ("/stock/analyzer/search".equals(path)) return analyzer.search(q.getOrDefault("keyword",""));
        if (path!=null && path.matches("/stock/analyzer/quote/(sh|sz)[0-9]{6}")) return analyzer.quote(path.substring(path.lastIndexOf('/')+1));
        if (path!=null && path.matches("/stock/analyzer/kline/(sh|sz)[0-9]{6}"))
        {
            int limit=Integer.parseInt(q.getOrDefault("limit","30"));
            if (limit<1 || limit>60) throw new ServiceException("日K线最多60条");
            return analyzer.kline(path.substring(path.lastIndexOf('/')+1),limit);
        }
        if ("/stock/analyzer/analyze".equals(path))
        {
            Object code=input.body()==null?null:input.body().get("stockCode");
            if (!(code instanceof String) || !((String)code).matches("(sh|sz)[0-9]{6}")) throw new ServiceException("股票代码无效");
            return analyzer.analyze(Map.of("stockCode",(String)code,"includeAi","false"));
        }
        LocalDate date=q.get("tradeDate")==null?null:LocalDate.parse(q.get("tradeDate"));
        if ("/stock/screener/results".equals(path)) return screener.results(q.get("snapshotId"),date,
            q.getOrDefault("signal","ALL"),q.getOrDefault("exchange","ALL"),q.getOrDefault("keyword",""),Boolean.parseBoolean(q.get("excludeST")),
            Integer.parseInt(q.getOrDefault("page","1")),Integer.parseInt(q.getOrDefault("pageSize","10")));
        if ("/stock/screener/detail".equals(path)) return screener.detail(q.get("stockCode"),q.get("snapshotId"),date);
        throw new ServiceException("定时报告只允许查询行情、自选、持仓与筛选快照");
    }

    @PostMapping("/finish")
    public AjaxResult finish(@RequestHeader(value="X-Report-Worker-Key",required=false) String key, @RequestBody WorkerInput input)
    {
        authenticate(key);
        // Failures must be recordable even when the owner's permissions were revoked during execution.
        if (input.error()!=null) reports.finish(input.runId(),input.leaseToken(),null,input.error());
        else asOwner(input,() -> { reports.finish(input.runId(),input.leaseToken(),input.content(),null); return null; });
        return AjaxResult.success();
    }
}
