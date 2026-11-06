// Production-bundle browser test with isolated API fixtures; no workbench data is accessed.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { chromium } = require(process.env.AGENT_BROWSER_MODULE || 'playwright')

async function main() {
  const root = path.resolve(__dirname, '../dist')
  const output = process.env.REPORT_UI_SCREENSHOTS || path.join(os.tmpdir(), 'ai-stock-reports-ui')
  fs.mkdirSync(output, { recursive: true })
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' }
  const server = http.createServer((req, res) => {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname))
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403).end(); return }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html')
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  let browser
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.AGENT_BROWSER_EXECUTABLE ? { executablePath: process.env.AGENT_BROWSER_EXECUTABLE } : {}) })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/New_York', reducedMotion: 'reduce', serviceWorkers: 'block' })
    await context.addCookies([{ name: 'Admin-Token', value: 'report-preview-only', url: origin }])
    const at = Date.parse('2026-11-05T08:00:00Z')
    const tasks = [
      { taskId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', title: '每周市场趋势观察', prompt: '梳理本周A股指数走势、市场风格、重要消息与下周关注点，注明证据来源和行情时间。', scheduleType: 'weekly', hour: 9, minute: 0, weekDay: 6, status: 'enabled', nextRunAt: at + 2 * 86400000, version: 1 },
      { taskId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', title: '我的持仓今日概况', prompt: '每次执行时查询我的最新持仓，汇总今日表现、520指标和风险。', scheduleType: 'once', runAt: '2026-11-05T16:00:00', status: 'completed', nextRunAt: null, version: 2 },
      { taskId: 'cccccccc-cccc-cccc-cccc-cccccccccccc', title: '收盘后的每日复盘', prompt: '总结当天大盘与我的持仓，不编造数据。', scheduleType: 'daily', hour: 17, minute: 30, status: 'paused', nextRunAt: null, version: 1 }
    ]
    const reports = [
      { runId: 'dddddddd-dddd-dddd-dddd-dddddddddddd', taskId: tasks[0].taskId, title: '每周市场趋势观察', prompt: tasks[0].prompt, scheduleType: 'weekly', triggerType: 'scheduled', scheduledAt: at, finishedAt: at + 60000, status: 'succeeded', content: '# 本周市场观察\n\n> 浏览器验收使用的模拟报告，不代表真实行情。\n\n## 市场趋势\n\n报告应结合可核实的数据，区分事实和推断。\n\n| 关注点 | 说明 |\n| --- | --- |\n| 指数趋势 | 核对行情日期 |\n| 市场风格 | 结合来源分析 |\n\n## 风险与来源\n\n数据不足时明确说明。[参考来源](https://example.com)' },
      { runId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', taskId: tasks[1].taskId, title: '我的持仓今日概况', prompt: tasks[1].prompt, scheduleType: 'once', triggerType: 'scheduled', scheduledAt: at, status: 'running' },
      { runId: 'ffffffff-ffff-ffff-ffff-ffffffffffff', taskId: tasks[2].taskId, title: '收盘后的每日复盘', prompt: tasks[2].prompt, scheduleType: 'daily', triggerType: 'manual', scheduledAt: at - 86400000, finishedAt: at - 86300000, status: 'failed', error: '行情服务暂时不可用，请检查后手动重跑' }
    ]
    reports[0].content += '\n\n## 趋势示意\n\n```echarts\n' + JSON.stringify({ xAxis: { type: 'category', data: ['周一', '周二', '周三'] }, yAxis: { type: 'value' }, series: [{ type: 'line', data: [10, 12, 11] }] }) + '\n```\n\n```javascript\nconst example = "示意数据"\n```\n\n<script>window.reportInjected = true</script>\n\n![外部示意图](https://example.com/report-preview.png)'
    let created = 0
    let previewPermissions = ['*:*:*']
    let reportRequests = 0
    let workerReady = true
    const executionState = () => ({ executionReady: workerReady, executionMessage: workerReady ? '报告执行器在线' : '报告执行器尚未配置，暂不能执行，请联系管理员' })
    const pageRows = (rows, url) => {
      const kind = url.searchParams.get('kind'), keyword = url.searchParams.get('keyword') || ''
      const filtered = rows.filter(row => (!kind || kind === 'all' || (kind === 'once' ? row.scheduleType === 'once' : row.scheduleType !== 'once')) && row.title.includes(keyword))
      return { rows: filtered, total: filtered.length }
    }
    await context.route('**/prod-api/**', async route => {
      const req = route.request(), url = new URL(req.url()), p = url.pathname.replace('/prod-api', ''), method = req.method()
      let data = [], result
      if (p.startsWith('/agent/reports')) reportRequests++
      if (p === '/getInfo') result = { code: 200, user: { userId: 42, userName: 'orange', nickName: 'orange', avatar: '' }, roles: ['admin'], permissions: previewPermissions, isDefaultModifyPwd: false, isPasswordExpired: false }
      else if (p === '/getRouters') data = [{ path: '/', component: 'Layout', children: [
        { path: 'agent-chat', name: 'AgentChat', component: 'agent/chat/index', meta: { title: 'Agent助手', icon: 'message' } },
        { path: 'agent-reports', name: 'AgentReports', hidden: true, component: 'agent/reports/index', meta: { title: '报告中心', icon: 'date' } }
      ] }]
      else if (p === '/agent/reports/health') data = { configured: workerReady, lastSeenAt: workerReady ? Date.now() : 0, timeZone: 'Asia/Shanghai' }
      else if (p === '/agent/reports/tasks' && method === 'GET') data = pageRows(tasks.map(task => ({ ...task, ...executionState() })), url)
      else if (p === '/agent/reports' && method === 'GET') data = pageRows(reports, url)
      else if (p === '/agent/reports/tasks' && method === 'POST') {
        const body = req.postDataJSON(); created++; data = { ...body, taskId: '11111111-1111-1111-1111-' + String(created).padStart(12, '0'), status: 'enabled', nextRunAt: at + 86400000, version: 1, ...executionState() }; tasks.unshift(data)
      } else if (p.startsWith('/agent/reports/tasks/')) {
        const id = p.split('/')[4], task = tasks.find(row => row.taskId === id)
        if (p.endsWith('/status')) { const body = req.postDataJSON(); task.status = body.action === 'pause' ? 'paused' : 'enabled'; task.version++; data = task }
        else if (p.endsWith('/run')) { data = { ...reports[0], runId: '22222222-2222-2222-2222-222222222222', title: task.title, status: 'queued', triggerType: 'manual' }; reports.unshift(data) }
        else if (method === 'PUT') { Object.assign(task, req.postDataJSON(), { version: task.version + 1 }); data = task }
        else if (method === 'DELETE') { tasks.splice(tasks.indexOf(task), 1); data = {} }
        else data = { ...task, ...executionState() }
      } else if (p.startsWith('/agent/reports/')) {
        const id = p.split('/')[3], row = reports.find(item => item.runId === id)
        if (method === 'DELETE') { reports.splice(reports.indexOf(row), 1); data = {} } else data = row
      }
      await route.fulfill({ json: result || { code: 200, data } })
    })
    await context.addInitScript(() => {
      const summary = { id: 'report-chat', title: '在对话中管理报告', updatedAt: new Date().toISOString(), messageCount: 2 }
      class PreviewSocket {
        static OPEN = 1
        static CONNECTING = 0
        constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen() }, 0) }
        deliver(message) { setTimeout(() => { if (this.readyState === 1 && this.onmessage) this.onmessage({ data: JSON.stringify(message) }) }, 0) }
        send(raw) {
          const command = JSON.parse(raw), requestId = command.requestId
          if (command.type === 'ping') this.deliver({ type: 'pong' })
          if (command.type === 'init') this.deliver({ type: 'init', protocolVersion: 1, userId: '42', sessions: [summary], settings: {}, models: [{ provider: 'deepseek', id: 'deepseek-flash', name: 'DeepSeek', supportsImages: false }], providers: [], requestId })
          if (command.type === 'list_sessions') this.deliver({ type: 'sessions', sessions: [summary], requestId })
          if (command.type === 'load_session') this.deliver({ type: 'session_state', requestId, session: {
            summary, isStreaming: false, epoch: 'report-preview', sequence: 0, model: { provider: 'deepseek', id: 'deepseek-flash' }, thinkingLevel: 'low', messages: [
              { id: 'user', role: 'user', text: '我希望在聊天时管理报告。' },
              { id: 'assistant', role: 'assistant', text: '报告与对话可同时查看。', tools: [{ id: 'report-preview-tool', name: 'Agent', input: { profile: 'stock-analyst', task: '分析市场' }, status: 'done', output: '已完成模拟分析', subagent: { id: 'child', name: '股票分析', profile: 'stock-analyst', status: 'done', messages: [{ id: 'child-answer', role: 'assistant', text: '子代理过程仍可查看。' }] } }] }
            ]
          } })
        }
        close() { this.readyState = 3; if (this.onclose) this.onclose({ code: 1000 }) }
      }
      window.WebSocket = PreviewSocket
    })
    const page = await context.newPage(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(origin + '/agent-reports', { waitUntil: 'networkidle' })
    assert.equal(new URL(page.url()).pathname, '/agent-chat', 'legacy URL must redirect into Agent')
    await page.getByText('报告与对话可同时查看。', { exact: true }).waitFor()
    await page.locator('.agent-composer textarea').fill('保留我的问题草稿')
    await page.locator('.report-card').first().waitFor()
    const rightResizer = page.getByRole('separator', { name: '调整右侧栏宽度' })
    const originalReportWidth = (await page.locator('.agent-report-panel').boundingBox()).width
    const reportGrip = await rightResizer.boundingBox()
    await page.mouse.move(reportGrip.x + reportGrip.width / 2, reportGrip.y + reportGrip.height / 2)
    await page.mouse.down(); await page.mouse.move(reportGrip.x + reportGrip.width / 2 - 65, reportGrip.y + reportGrip.height / 2, { steps: 8 }); await page.mouse.up()
    await page.waitForFunction(original => document.querySelector('.agent-report-panel').getBoundingClientRect().width >= original + 60, originalReportWidth)
    const savedReportWidth = (await page.locator('.agent-report-panel').boundingBox()).width
    assert.equal(await page.locator('.report-card').count(), 3)
    assert.match(await page.locator('.report-card__time').first().textContent(), /16:00/, 'report time must be Shanghai despite New York browser zone')
    const chatBounds = await page.locator('.agent-main').boundingBox(), reportBounds = await page.locator('.agent-report-panel').boundingBox()
    assert.ok(chatBounds.x + chatBounds.width <= reportBounds.x + 1, 'desktop report panel overlaps the conversation')
    await page.locator('.agent-chat-page').screenshot({ path: path.join(output, 'reports-desktop.png') })
    await page.locator('.report-card').first().click()
    await page.locator('.report-reader .agent-rich-content').waitFor()
    await page.locator('.report-reader').screenshot({ path: path.join(output, 'report-reader-desktop.png') })
    const htmlDownload = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出 HTML' }).click()
    const exported = await htmlDownload
    assert.ok(exported.suggestedFilename().endsWith('.html'))
    const exportPath = path.join(output, 'report-export.html')
    await exported.saveAs(exportPath)
    const exportedHtml = fs.readFileSync(exportPath, 'utf8')
    assert.match(exportedHtml, /data-chart-status="exported"/, 'valid chart must be included in download')
    assert.ok(!exportedHtml.includes('report-preview-only'), 'download must not contain login credentials')
    assert.ok(!/<script\b/i.test(exportedHtml), 'download has no executable scripts')
    const offlineContext = await browser.newContext({ viewport: { width: 1200, height: 1000 } })
    await offlineContext.setOffline(true)
    const offlinePage = await offlineContext.newPage(), networkRequests = []
    offlinePage.on('pageerror', error => errors.push(error.message))
    offlinePage.on('request', request => { if (/^https?:/i.test(request.url())) networkRequests.push(request.url()) })
    await offlinePage.goto(pathToFileURL(exportPath).href)
    await offlinePage.locator('.report-chart > img').waitFor()
    await offlinePage.waitForFunction(() => Array.from(document.querySelectorAll('.report-chart > img')).every(image => image.complete && image.naturalWidth > 0))
    assert.equal(await offlinePage.locator('.report-content table').count(), 1)
    assert.equal(await offlinePage.locator('.report-code .hljs').count(), 2)
    assert.equal(await offlinePage.locator('a[href="https://example.com"]').count(), 1)
    assert.equal(await offlinePage.locator('.report-external-image').count(), 1)
    assert.match(await offlinePage.locator('.report-meta').innerText(), /16:00/)
    assert.equal(await offlinePage.evaluate(() => window.reportInjected), undefined)
    assert.deepEqual(networkRequests, [], 'download must open without network dependencies')
    await offlinePage.screenshot({ path: path.join(output, 'report-html-offline-desktop.png'), fullPage: true })
    await offlinePage.setViewportSize({ width: 390, height: 844 })
    assert.ok(await offlinePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'offline report must fit mobile screen')
    await offlinePage.screenshot({ path: path.join(output, 'report-html-offline-mobile.png'), fullPage: true })
    await offlineContext.close()
    await page.getByRole('button', { name: '返回列表', exact: false }).click()
    await page.getByRole('button', { name: '切换到暗色主题' }).click()
    assert.equal(await page.locator('.reports-page').evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(41, 42, 45)')
    await page.locator('.agent-chat-page').screenshot({ path: path.join(output, 'reports-dark-desktop.png') })
    await page.getByRole('button', { name: '新建报告任务' }).click()
    const darkDialog = page.locator('.report-form-dialog:visible').first()
    assert.equal(await darkDialog.evaluate(element => getComputedStyle(element).backgroundColor), 'rgb(41, 42, 45)')
    await darkDialog.getByRole('button', { name: '取消', exact: true }).click()
    await page.getByRole('button', { name: '切换到亮色主题' }).click()
    await page.getByRole('button', { name: '查看子代理对话', exact: false }).click()
    await page.locator('.agent-subagent-panel').waitFor()
    assert.equal(await page.locator('.agent-report-panel').count(), 0, 'subagent view must replace the report panel')
    await page.getByRole('button', { name: '打开报告中心', exact: true }).click()
    await page.locator('.agent-report-panel').waitFor()
    assert.equal(await page.locator('.agent-subagent-panel').count(), 0, 'report view must replace the subagent panel')
    assert.ok(Math.abs((await page.locator('.agent-report-panel').boundingBox()).width - savedReportWidth) < 2, 'report width should survive switching right panels')
    assert.equal(await page.locator('.agent-composer textarea').inputValue(), '保留我的问题草稿')
    await page.getByRole('button', { name: '任务管理', exact: false }).click()
    await page.locator('.report-task').first().waitFor()
    await page.getByRole('button', { name: '新建报告任务' }).click()
    const dialog = page.locator('.report-form-dialog:visible').first()
    await dialog.locator('input').first().fill('测试周报任务')
    await dialog.locator('textarea').fill('查询我的持仓并分析本周表现，注明日期和来源。')
    await dialog.locator('.el-radio-button').filter({ hasText: '每周' }).click()
    await dialog.getByRole('button', { name: '创建任务', exact: true }).click()
    const row = () => page.locator('.report-task').filter({ hasText: '测试周报任务' })
    await row().waitFor()
    await row().getByRole('button', { name: '编辑', exact: true }).click()
    await dialog.locator('input').first().fill('测试周报任务（已修改）')
    await dialog.getByRole('button', { name: '保存修改' }).click()
    await row().getByRole('heading', { name: '测试周报任务（已修改）' }).waitFor()
    await row().getByRole('button', { name: '更多' }).click()
    await page.locator('.el-dropdown-menu:visible').getByText('暂停任务', { exact: true }).click()
    await page.locator('.el-message-box').getByRole('button', { name: '确定', exact: true }).click()
    await row().getByText('已暂停', { exact: true }).waitFor()
    await row().getByRole('button', { name: '更多' }).click()
    await page.locator('.el-dropdown-menu:visible').getByText('恢复任务', { exact: true }).click()
    await row().getByText('已启用', { exact: true }).waitFor()
    await row().getByRole('button', { name: '更多' }).click()
    await page.locator('.el-dropdown-menu:visible').getByText('立即生成', { exact: true }).click()
    await page.getByText('已加入生成队列，请在“我的报告”查看进度').waitFor()
    await page.locator('.el-message').first().waitFor({ state: 'detached' })
    await page.locator('.agent-chat-page').screenshot({ path: path.join(output, 'report-tasks-desktop.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: path.join(output, 'report-tasks-mobile.png') })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile tasks overflow horizontally')
    const mobileChat = await page.locator('.agent-chat-page').boundingBox(), mobilePanel = await page.locator('.agent-report-panel').boundingBox()
    assert.equal(await page.getByRole('separator').count(), 0, 'resize handles should not appear in mobile overlays')
    assert.ok(Math.abs(mobileChat.width - mobilePanel.width) < 2, 'mobile report panel should fill the chat area')
    await page.getByRole('button', { name: '新建报告任务' }).click()
    const mobileDialog = page.locator('.report-form-dialog:visible').first()
    await mobileDialog.locator('input').first().fill('手机端编辑验收')
    await mobileDialog.locator('textarea').fill('确认手机端弹窗可以输入，遮罩不会挡住表单。')
    const dialogBounds = await mobileDialog.boundingBox()
    assert.ok(dialogBounds.x >= 0 && dialogBounds.x + dialogBounds.width <= 391, 'mobile task dialog exceeds the viewport')
    await page.screenshot({ path: path.join(output, 'report-form-mobile.png') })
    await mobileDialog.getByRole('button', { name: '取消', exact: true }).click()
    await row().getByRole('button', { name: '更多' }).click()
    await page.locator('.el-dropdown-menu:visible').getByText('删除任务', { exact: true }).click()
    await page.locator('.el-message-box').getByRole('button', { name: '确定', exact: true }).click()
    await row().waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '我的报告', exact: false }).click()
    await page.getByRole('button', { name: '一次性报告', exact: true }).click()
    await page.waitForFunction(() => document.querySelectorAll('.report-card').length === 1)
    await page.getByRole('button', { name: '定时报告', exact: true }).click()
    await page.locator('.report-card').filter({ hasText: '生成失败' }).click()
    await page.locator('.report-reader').getByText('行情服务暂时不可用，请检查后手动重跑', { exact: true }).waitFor()
    await page.locator('.report-reader').screenshot({ path: path.join(output, 'report-failure-mobile.png') })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile reader overflow horizontally')
    await page.getByRole('button', { name: '删除这份报告' }).click()
    await page.locator('.el-message-box').getByRole('button', { name: '确定', exact: true }).click()
    await page.locator('.report-reader').waitFor({ state: 'detached' })
    await page.getByRole('button', { name: '关闭报告中心', exact: true }).click()
    await page.locator('.agent-report-panel').waitFor({ state: 'detached' })
    assert.equal(await page.locator('.agent-composer textarea').inputValue(), '保留我的问题草稿')
    await page.getByRole('button', { name: '打开报告中心', exact: true }).click()
    await page.locator('.agent-report-panel').waitFor()
    await page.getByRole('button', { name: '通过对话安排', exact: false }).click()
    await page.locator('.agent-report-panel').waitFor({ state: 'detached' })
    assert.equal(await page.locator('.agent-composer textarea').inputValue(), '请帮我安排一份定时报告。')
    workerReady = false
    await page.getByRole('button', { name: '打开报告中心', exact: true }).click()
    await page.getByRole('button', { name: '新建报告任务' }).click()
    const pendingDialog = page.locator('.report-form-dialog:visible').first()
    await pendingDialog.locator('input').first().fill('执行器未配置时保存的任务')
    await pendingDialog.locator('textarea').fill('执行器就绪后生成市场周报。')
    await pendingDialog.locator('.el-radio-button').filter({ hasText: '每周' }).click()
    await pendingDialog.getByRole('button', { name: '创建任务', exact: true }).click()
    await page.getByText('任务已保存，执行器尚未就绪，暂不能执行', { exact: true }).waitFor()
    const pendingRow = page.locator('.report-task').filter({ hasText: '执行器未配置时保存的任务' })
    await pendingRow.getByText('待执行器就绪', { exact: true }).waitFor()
    await pendingRow.getByRole('button', { name: '更多' }).click()
    const runItem = page.locator('.el-dropdown-menu:visible').getByText('立即生成', { exact: true })
    assert.match(await runItem.getAttribute('class'), /is-disabled/)
    await page.locator('.reports-header strong').click()
    assert.equal(await page.locator('.agent-report-panel').count(), 1, 'pending task should remain in the report sidebar')
    await page.screenshot({ path: path.join(output, 'report-unconfigured-mobile.png') })
    workerReady = true
    await page.locator('.reports-toolbar > .el-button').click()
    await pendingRow.getByText('已启用', { exact: true }).waitFor()
    assert.equal(tasks.filter(task => task.title === '执行器未配置时保存的任务').length, 1, 'executor readiness must not require recreating the task')
    await page.getByRole('button', { name: '关闭报告中心', exact: true }).click()
    await page.locator('.agent-report-panel').waitFor({ state: 'detached' })
    previewPermissions = ['agent:chat:use']
    const requestsBefore = reportRequests, restricted = await context.newPage()
    await restricted.goto(origin + '/agent-chat?panel=reports', { waitUntil: 'networkidle' })
    assert.equal(await restricted.locator('.agent-report-panel').count(), 0)
    assert.equal(await restricted.locator('.agent-report-toggle').count(), 0)
    assert.equal(reportRequests, requestsBefore, 'accounts without report permission must not fetch reports')
    await restricted.close()
    assert.deepEqual(errors, [], 'browser runtime errors')
    console.log(JSON.stringify({ screenshots: output, checks: ['legacy URL redirect', 'Agent sidebar layout', 'chat draft preservation', 'subagent panel switching', 'dark theme', 'Shanghai timezone', 'report reader', 'HTML download', 'offline embedded charts', 'offline mobile layout', 'script-free export', 'create', 'edit', 'pause', 'resume', 'run', 'delete task and report', 'report categories', 'mobile overlay and overflow', 'failure details', 'conversation entry', 'report permissions', 'save without executor configuration', 'readiness without recreating task'], browserErrors: errors }))
  } finally {
    if (browser) await browser.close()
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
