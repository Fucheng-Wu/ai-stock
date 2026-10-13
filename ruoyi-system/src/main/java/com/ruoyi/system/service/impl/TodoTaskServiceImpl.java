package com.ruoyi.system.service.impl;

import java.util.List;
import org.springframework.stereotype.Service;
import com.ruoyi.common.exception.ServiceException;
import com.ruoyi.common.utils.StringUtils;
import com.ruoyi.system.domain.todo.TodoTask;
import com.ruoyi.system.mapper.todo.TodoTaskMapper;
import com.ruoyi.system.service.ITodoTaskService;

@Service
public class TodoTaskServiceImpl implements ITodoTaskService
{
    private static final String STATUS_PENDING = "0";
    private static final String STATUS_DONE = "1";
    private static final int MAX_CONTENT_LENGTH = 500;
    private static final int MAX_CATEGORY_LENGTH = 20;

    private final TodoTaskMapper todoTaskMapper;

    public TodoTaskServiceImpl(TodoTaskMapper todoTaskMapper)
    {
        this.todoTaskMapper = todoTaskMapper;
    }

    @Override
    public List<TodoTask> list(Long userId)
    {
        return todoTaskMapper.selectByUserId(userId);
    }

    @Override
    public void add(Long userId, String content, String category, String userName)
    {
        TodoTask task = new TodoTask();
        task.setUserId(userId);
        task.setContent(normalizeContent(content));
        task.setCategory(normalizeCategory(category));
        task.setStatus(STATUS_PENDING);
        task.setCreateBy(userName);
        todoTaskMapper.insertTask(task);
    }

    @Override
    public void update(Long userId, TodoTask task, String userName)
    {
        if (task == null || task.getTaskId() == null) throw new ServiceException("待办不存在");
        TodoTask existing = todoTaskMapper.selectByIdAndUserId(task.getTaskId(), userId);
        if (existing == null) throw new ServiceException("待办不存在");
        if (StringUtils.isNotEmpty(task.getContent())) existing.setContent(normalizeContent(task.getContent()));
        if (StringUtils.isNotEmpty(task.getCategory())) existing.setCategory(normalizeCategory(task.getCategory()));
        if (StringUtils.isNotEmpty(task.getStatus())) existing.setStatus(normalizeStatus(task.getStatus()));
        existing.setUpdateBy(userName);
        todoTaskMapper.updateTask(existing);
    }

    @Override
    public void remove(Long userId, Long taskId)
    {
        if (todoTaskMapper.deleteByIdAndUserId(taskId, userId) == 0)
        {
            throw new ServiceException("待办不存在");
        }
    }

    private String normalizeContent(String content)
    {
        String text = StringUtils.trim(content);
        if (StringUtils.isEmpty(text)) throw new ServiceException("待办内容不能为空");
        if (text.length() > MAX_CONTENT_LENGTH) throw new ServiceException("待办内容不能超过" + MAX_CONTENT_LENGTH + "个字符");
        return text;
    }

    private String normalizeCategory(String category)
    {
        String text = StringUtils.trim(category);
        if (StringUtils.isEmpty(text)) throw new ServiceException("请选择待办分类");
        if (text.length() > MAX_CATEGORY_LENGTH) throw new ServiceException("待办分类不能超过" + MAX_CATEGORY_LENGTH + "个字符");
        return text;
    }

    private String normalizeStatus(String status)
    {
        String text = StringUtils.trim(status);
        if (!STATUS_PENDING.equals(text) && !STATUS_DONE.equals(text)) throw new ServiceException("待办状态不正确");
        return text;
    }
}
