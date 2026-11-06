package com.ruoyi.web.controller.report;

import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import com.ruoyi.common.core.controller.BaseController;
import com.ruoyi.common.core.domain.AjaxResult;
import com.ruoyi.system.domain.report.ReportTaskInput;
import com.ruoyi.system.service.report.AgentReportService;

@RestController
@RequestMapping("/agent/reports")
public class AgentReportController extends BaseController
{
    private final AgentReportService service;
    public AgentReportController(AgentReportService service) { this.service = service; }

    @PreAuthorize("@ss.hasPermi('agent:report:list') and @ss.hasPermi('agent:chat:use')")
    @GetMapping("/health")
    public AjaxResult health() { return success(service.health()); }

    @PreAuthorize("@ss.hasPermi('agent:report:list') and @ss.hasPermi('agent:chat:use')")
    @GetMapping("/tasks")
    public AjaxResult tasks(@RequestParam(defaultValue="all") String kind, @RequestParam(defaultValue="") String keyword,
        @RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="20") int pageSize)
    { return success(service.tasks(getUserId(),kind,keyword,page,pageSize)); }

    @PreAuthorize("@ss.hasPermi('agent:report:list') and @ss.hasPermi('agent:chat:use')")
    @GetMapping("/tasks/{id}")
    public AjaxResult task(@PathVariable String id) { return success(service.task(getUserId(),id)); }

    @PreAuthorize("@ss.hasPermi('agent:report:add') and @ss.hasPermi('agent:chat:use')")
    @PostMapping("/tasks")
    public AjaxResult create(@RequestBody ReportTaskInput input) { return success(service.create(getUserId(),input)); }

    @PreAuthorize("@ss.hasPermi('agent:report:edit') and @ss.hasPermi('agent:chat:use')")
    @PutMapping("/tasks/{id}")
    public AjaxResult update(@PathVariable String id, @RequestBody ReportTaskInput input)
    { return success(service.update(getUserId(),id,input)); }

    public record StatusInput(String action, int version) {}
    @PreAuthorize("@ss.hasPermi('agent:report:edit') and @ss.hasPermi('agent:chat:use')")
    @PostMapping("/tasks/{id}/status")
    public AjaxResult status(@PathVariable String id, @RequestBody StatusInput input)
    { return success(service.setStatus(getUserId(),id,input.action(),input.version())); }

    @PreAuthorize("@ss.hasPermi('agent:report:remove') and @ss.hasPermi('agent:chat:use')")
    @DeleteMapping("/tasks/{id}")
    public AjaxResult remove(@PathVariable String id, @RequestParam int version)
    { service.deleteTask(getUserId(),id,version); return success(); }

    @PreAuthorize("@ss.hasPermi('agent:report:edit') and @ss.hasPermi('agent:chat:use')")
    @PostMapping("/tasks/{id}/run")
    public AjaxResult run(@PathVariable String id, @RequestBody Map<String,String> body)
    { return success(service.runNow(getUserId(),id,body.get("requestKey"))); }

    @PreAuthorize("@ss.hasPermi('agent:report:list') and @ss.hasPermi('agent:chat:use')")
    @GetMapping
    public AjaxResult reports(@RequestParam(defaultValue="all") String kind, @RequestParam(defaultValue="") String keyword,
        @RequestParam(defaultValue="1") int page, @RequestParam(defaultValue="20") int pageSize)
    { return success(service.reports(getUserId(),kind,keyword,page,pageSize)); }

    @PreAuthorize("@ss.hasPermi('agent:report:list') and @ss.hasPermi('agent:chat:use')")
    @GetMapping("/{id}")
    public AjaxResult report(@PathVariable String id) { return success(service.report(getUserId(),id)); }

    @PreAuthorize("@ss.hasPermi('agent:report:remove') and @ss.hasPermi('agent:chat:use')")
    @DeleteMapping("/{id}")
    public AjaxResult deleteReport(@PathVariable String id) { service.deleteReport(getUserId(),id); return success(); }
}
