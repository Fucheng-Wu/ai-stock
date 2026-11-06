import request from '@/utils/request'

const root = '/agent/reports'
export const getReportHealth = () => request({ url: root + '/health', method: 'get' })
export const listReportTasks = params => request({ url: root + '/tasks', method: 'get', params })
export const getReportTask = id => request({ url: `${root}/tasks/${id}`, method: 'get' })
export const createReportTask = data => request({ url: root + '/tasks', method: 'post', data })
export const updateReportTask = (id, data) => request({ url: `${root}/tasks/${id}`, method: 'put', data })
export const changeReportTaskStatus = (id, data) => request({ url: `${root}/tasks/${id}/status`, method: 'post', data })
export const deleteReportTask = (id, version) => request({ url: `${root}/tasks/${id}`, method: 'delete', params: { version } })
export const runReportTask = (id, requestKey) => request({ url: `${root}/tasks/${id}/run`, method: 'post', data: { requestKey } })
export const listReports = params => request({ url: root, method: 'get', params })
export const getReport = id => request({ url: `${root}/${id}`, method: 'get' })
export const deleteReport = id => request({ url: `${root}/${id}`, method: 'delete' })
