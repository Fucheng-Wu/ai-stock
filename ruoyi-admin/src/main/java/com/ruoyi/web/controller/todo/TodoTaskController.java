package com.ruoyi.web.controller.todo;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.ruoyi.common.core.controller.BaseController;
import com.ruoyi.common.core.domain.AjaxResult;
import com.ruoyi.system.domain.todo.TodoTask;
import com.ruoyi.system.service.ITodoTaskService;

@RestController
@RequestMapping("/todo/task")
public class TodoTaskController extends BaseController
{
    private final ITodoTaskService todoTaskService;

    public TodoTaskController(ITodoTaskService todoTaskService)
    {
        this.todoTaskService = todoTaskService;
    }

    @PreAuthorize("@ss.hasPermi('todo:task:list')")
    @GetMapping("/list")
    public AjaxResult list()
    {
        return success(todoTaskService.list(getUserId()));
    }

    @PreAuthorize("@ss.hasPermi('todo:task:add')")
    @PostMapping
    public AjaxResult add(@RequestBody TodoTask task)
    {
        todoTaskService.add(getUserId(), task.getContent(), task.getCategory(), getUsername());
        return success();
    }

    @PreAuthorize("@ss.hasPermi('todo:task:edit')")
    @PutMapping
    public AjaxResult update(@RequestBody TodoTask task)
    {
        todoTaskService.update(getUserId(), task, getUsername());
        return success();
    }

    @PreAuthorize("@ss.hasPermi('todo:task:remove')")
    @DeleteMapping("/{taskId}")
    public AjaxResult remove(@PathVariable Long taskId)
    {
        todoTaskService.remove(getUserId(), taskId);
        return success();
    }
}
