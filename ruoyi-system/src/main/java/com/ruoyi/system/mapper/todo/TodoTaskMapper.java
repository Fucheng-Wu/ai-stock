package com.ruoyi.system.mapper.todo;

import java.util.List;
import org.apache.ibatis.annotations.Param;
import com.ruoyi.system.domain.todo.TodoTask;

public interface TodoTaskMapper
{
    List<TodoTask> selectByUserId(Long userId);
    TodoTask selectByIdAndUserId(@Param("taskId") Long taskId, @Param("userId") Long userId);
    int insertTask(TodoTask task);
    int updateTask(TodoTask task);
    int deleteByIdAndUserId(@Param("taskId") Long taskId, @Param("userId") Long userId);
}
