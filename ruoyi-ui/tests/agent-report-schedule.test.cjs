const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const source = fs.readFileSync(path.join(__dirname, '../src/utils/agent-report-schedule.js'), 'utf8')
const modulePromise = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))

test('repeat options and displayed schedules cover all alarm modes', async () => {
  const { REPORT_REPEAT_OPTIONS, reportScheduleLabel } = await modulePromise
  assert.deepEqual(REPORT_REPEAT_OPTIONS.map(option => option.label), ['仅一次', '每天', '法定工作日', '节假日及周末', '单双休工作日', '自定义'])
  assert.equal(reportScheduleLabel({ scheduleType: 'workday', hour: 9, minute: 5 }), '法定工作日 09:05')
  assert.equal(reportScheduleLabel({ scheduleType: 'holiday', hour: 9, minute: 5 }), '节假日及周末 09:05')
  assert.equal(reportScheduleLabel({ scheduleType: 'custom', hour: 9, minute: 0, weekDays: [1, 3, 5] }), '星期一、星期三、星期五 09:00')
  for (const workweek of ['single', 'double']) assert.match(reportScheduleLabel({ scheduleType: 'workweek', hour: 9, minute: 0, workweek }), workweek === 'single' ? /周一至周六/ : /周一至周五/)
})

test('existing weekly tasks edit as custom days and clear irrelevant scheduling fields', async () => {
  const { reportScheduleForm, reportSchedulePayload } = await modulePromise
  const form = reportScheduleForm({ title: ' 周报 ', prompt: ' 内容 ', scheduleType: 'weekly', weekDay: 6, hour: 9, minute: 30, version: 7 })
  assert.equal(form.scheduleType, 'custom'); assert.deepEqual(form.weekDays, [6]); assert.equal(form.time, '09:30')
  const payload = reportSchedulePayload(form)
  assert.deepEqual(payload.weekDays, [6]); assert.equal(payload.weekDay, null); assert.equal(payload.workweek, null); assert.equal(payload.version, 7)
  const custom = { ...form, weekDays: [5, 1, 3] }
  assert.deepEqual(reportSchedulePayload(custom).weekDays, [1, 3, 5]); assert.deepEqual(custom.weekDays, [5, 1, 3])
  const once = reportSchedulePayload({ ...custom, scheduleType: 'once', runAt: '2027-02-14T09:00:00' })
  assert.equal(once.runAt, '2027-02-14T09:00:00'); assert.equal(once.hour, null); assert.equal(once.minute, null); assert.equal(once.weekDays, null)
  const fixed = reportSchedulePayload({ ...custom, scheduleType: 'workweek', workweek: 'single' })
  assert.equal(fixed.workweek, 'single'); assert.equal(fixed.weekDays, null); assert.equal(fixed.runAt, null)
})
