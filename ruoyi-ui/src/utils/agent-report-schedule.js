export const REPORT_REPEAT_OPTIONS = [
  { value: 'once', label: '仅一次' },
  { value: 'daily', label: '每天' },
  { value: 'workday', label: '法定工作日' },
  { value: 'holiday', label: '节假日及周末' },
  { value: 'workweek', label: '单双休工作日' },
  { value: 'custom', label: '自定义' }
]

export const REPORT_WEEK_DAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']

export function reportScheduleLabel(task) {
  if (task.scheduleType === 'once') return '仅一次 · ' + (task.runAt || '').replace('T', ' ').slice(0, 16)
  const time = String(task.hour).padStart(2, '0') + ':' + String(task.minute).padStart(2, '0')
  let label = (REPORT_REPEAT_OPTIONS.find(option => option.value === task.scheduleType) || {}).label || '未知规则'
  if (task.scheduleType === 'weekly') label = '每' + REPORT_WEEK_DAYS[task.weekDay - 1]
  if (task.scheduleType === 'custom') label = (task.weekDays || []).map(day => REPORT_WEEK_DAYS[day - 1]).join('、')
  if (task.scheduleType === 'workweek') label = task.workweek === 'single' ? '单休工作日（周一至周六）' : '双休工作日（周一至周五）'
  return label + ' ' + time
}

export function reportScheduleForm(task) {
  return {
    ...task,
    scheduleType: task.scheduleType === 'weekly' ? 'custom' : task.scheduleType,
    weekDays: task.scheduleType === 'weekly' ? [task.weekDay] : [...(task.weekDays || [])],
    workweek: task.workweek || 'double',
    time: String(task.hour == null ? 9 : task.hour).padStart(2, '0') + ':' + String(task.minute || 0).padStart(2, '0')
  }
}

export function reportSchedulePayload(form) {
  const once = form.scheduleType === 'once'
  const [hour, minute] = (form.time || '').split(':').map(Number)
  return {
    title: form.title.trim(), prompt: form.prompt.trim(), scheduleType: form.scheduleType,
    runAt: once ? form.runAt : null, hour: once ? null : hour, minute: once ? null : minute,
    weekDay: null,
    weekDays: form.scheduleType === 'custom' ? [...form.weekDays].sort((a, b) => a - b) : null,
    workweek: form.scheduleType === 'workweek' ? form.workweek : null,
    version: form.version, requestKey: form.requestKey
  }
}
