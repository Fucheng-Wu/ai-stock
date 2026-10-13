package com.ruoyi.system.domain.todo;

import com.ruoyi.common.core.domain.BaseEntity;

public class TodoTask extends BaseEntity
{
    private static final long serialVersionUID = 1L;

    private Long taskId;
    private Long userId;
    private String content;
    private String category;
    private String status;

    public Long getTaskId() { return taskId; }
    public void setTaskId(Long taskId) { this.taskId = taskId; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
