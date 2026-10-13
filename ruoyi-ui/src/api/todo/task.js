import request from '@/utils/request'

export const listTodoTasks = () => request({ url: '/todo/task/list', method: 'get' })
export const addTodoTask = data => request({ url: '/todo/task', method: 'post', data })
export const updateTodoTask = data => request({ url: '/todo/task', method: 'put', data })
export const removeTodoTask = taskId => request({ url: `/todo/task/${taskId}`, method: 'delete' })
