package com.ruoyi.web.controller.report;

import java.lang.reflect.Proxy;
import java.util.*;
import org.junit.jupiter.api.*;
import static org.junit.jupiter.api.Assertions.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;
import com.ruoyi.common.core.domain.AjaxResult;
import com.ruoyi.common.core.domain.entity.SysUser;
import com.ruoyi.common.utils.SecurityUtils;
import com.ruoyi.framework.web.service.SysPermissionService;
import com.ruoyi.system.service.ISysUserService;
import com.ruoyi.system.service.report.AgentReportService;
import com.ruoyi.web.controller.stock.StockPositionController;

class AgentReportWorkerControllerTest
{
    private static final String KEY="test-report-worker-key-01234567890123456789";
    private AgentReportWorkerController controller;
    private Set<String> granted;
    private SysUser user;
    private boolean leased, finished;
    private AgentReportWorkerController.WorkerInput input(String path, String required, String content, String error)
    { return new AgentReportWorkerController.WorkerInput("run-one","lease-one",required,path,null,content,error); }
    @BeforeEach void setup() throws Exception
    {
        leased=true; finished=false;
        user=new SysUser(); user.setUserId(42L); user.setUserName("fixture"); user.setStatus("0"); user.setDelFlag("0");
        granted=new HashSet<>(Set.of("agent:chat:use","agent:report:list","stock:position:list"));
        AgentReportService reports=new AgentReportService(new JdbcTemplate(new DriverManagerDataSource("jdbc:unused"))) {
            @Override public Long workerOwner(String run,String lease) { if(!leased || !"run-one".equals(run) || !"lease-one".equals(lease)) throw new IllegalStateException("expired"); return 42L; }
            @Override public void finish(String run,String lease,String content,String error) { workerOwner(run,lease); finished=true; }
        };
        ISysUserService users=(ISysUserService)Proxy.newProxyInstance(getClass().getClassLoader(),new Class<?>[]{ISysUserService.class},
            (proxy,method,args)-> { if(method.getName().equals("selectUserById")){ assertEquals(42L,args[0]); return user; } throw new UnsupportedOperationException(); });
        SysPermissionService permissions=new SysPermissionService() { @Override public Set<String> getMenuPermission(SysUser owner) { return granted; } };
        StockPositionController positions=new StockPositionController(null,null,null) {
            @Override public AjaxResult list() { return AjaxResult.success(Map.of("owner",SecurityUtils.getUserId())); }
        };
        controller=new AgentReportWorkerController(reports,users,permissions,null,positions,null,null);
        var key=AgentReportWorkerController.class.getDeclaredField("workerKey"); key.setAccessible(true); key.set(controller,KEY);
    }
    @AfterEach void cleanup() { SecurityContextHolder.clearContext(); }

    @Test void serviceKeyAndRunLeaseAreBothRequired()
    {
        assertThrows(ResponseStatusException.class,()->controller.authorize(null,input(null,"stock:position:list",null,null)));
        assertThrows(ResponseStatusException.class,()->controller.authorize("wrong",input(null,"stock:position:list",null,null)));
        leased=false;
        assertThrows(RuntimeException.class,()->controller.authorize(KEY,input(null,"stock:position:list",null,null)));
    }
    @Test void readsUseStoredOwnerAndRestoreRequestSecurityContext()
    {
        var previous=SecurityContextHolder.getContext();
        AjaxResult result=controller.data(KEY,input("/stock/position/list",null,null,null));
        assertEquals(42L,((Map<?,?>)result.get("data")).get("owner"));
        assertSame(previous,SecurityContextHolder.getContext()); assertNull(previous.getAuthentication());
        granted.remove("stock:position:list");
        assertThrows(RuntimeException.class,()->controller.data(KEY,input("/stock/position/list",null,null,null)));
    }
    @Test void disabledUsersRevokedPermissionsAndWritesFailClosed()
    {
        user.setStatus("1");
        assertThrows(RuntimeException.class,()->controller.authorize(KEY,input(null,"agent:report:list",null,null)));
        user.setStatus("0"); granted.remove("agent:report:list");
        assertThrows(RuntimeException.class,()->controller.authorize(KEY,input(null,"stock:position:list",null,null)));
        granted.add("agent:report:list"); granted.add("*:*:*");
        // Even a superuser owner cannot widen the scheduled run beyond its fixed read-only surface.
        assertThrows(RuntimeException.class,()->controller.authorize(KEY,input(null,"stock:position:add",null,null)));
        for(String path:List.of("/stock/position","/todo/task","/system/user/list","https://example.com/stock/position/list","//localhost/stock/position/list","/agent/reports/tasks"))
            assertThrows(RuntimeException.class,()->controller.data(KEY,input(path,null,null,null)),path);
    }
    @Test void successRequiresCurrentPermissionsButFailureCanStillBeRecordedAfterRevocation()
    {
        granted.clear();
        assertThrows(RuntimeException.class,()->controller.finish(KEY,input(null,null,"# report",null)));
        assertFalse(finished);
        controller.finish(KEY,input(null,null,null,"用户权限已撤销"));
        assertTrue(finished);
    }
}
