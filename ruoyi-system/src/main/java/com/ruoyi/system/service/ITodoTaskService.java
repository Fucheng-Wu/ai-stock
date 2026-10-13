package com.ruoyi.system.service;

import java.util.List;
import com.ruoyi.system.domain.todo.TodoTask;

public interface ITodoTaskService
{
    List<TodoTask> list(Long userId);
    void add(Long userId, String content, String category, String userName);
    void update(Long userId, TodoTask task, String userName);
    void remove(Long userId, Long taskId);
}
