// Render the production build with isolated preview identities and data.
// AGENT_BROWSER_MODULE may point to a preinstalled Playwright package.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const { chromium } = require(process.env.AGENT_BROWSER_MODULE || 'playwright')

async function main() {
  const root = path.resolve(__dirname, '../dist')
  const output = process.env.AGENT_UI_SCREENSHOTS || path.join(os.tmpdir(), 'ai-stock-agent-ui')
  fs.mkdirSync(output, { recursive: true })
  const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' }
  const server = http.createServer((req, res) => {
    let filename = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname))
    if (filename !== root && !filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return }
    if (!fs.existsSync(filename) || fs.statSync(filename).isDirectory()) filename = path.join(root, 'index.html')
    res.writeHead(200, { 'content-type': types[path.extname(filename)] || 'application/octet-stream' })
    fs.createReadStream(filename).pipe(res)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  let browser
  try {
    const executablePath = process.env.AGENT_BROWSER_EXECUTABLE
    browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block', reducedMotion: 'reduce' })
    await context.addCookies([{ name: 'Admin-Token', value: 'visual-preview-only', url: origin }])
    await context.route('**/prod-api/**', async route => {
      const url = new URL(route.request().url())
      let result = { code: 200, data: [] }
      if (url.pathname.endsWith('/getInfo')) result = { code: 200, user: { userId: 42, userName: 'orange', nickName: 'orange', avatar: '' }, roles: ['admin'], permissions: ['*:*:*'], isDefaultModifyPwd: false, isPasswordExpired: false }
      if (url.pathname.endsWith('/getRouters')) result = { code: 200, data: [{ name: 'AgentSpace', path: '/agent', component: 'Layout', meta: { title: '工作台' }, children: [{ path: 'chat', name: 'AgentChat', component: 'agent/chat/index', meta: { title: 'Agent助手', icon: 'message' } }] }] }
      await route.fulfill({ json: result })
    })
    await context.addInitScript(() => {
      const today = new Date().toISOString()
      const sessions = [
        { id: 'research-1', title: '520 战法 · 趋势与信号解读', updatedAt: today, messageCount: 2 },
        { id: 'research-2', title: '如何理解均线与回踩信号', updatedAt: today, messageCount: 6 },
        { id: 'research-3', title: '本周市场资讯研究', updatedAt: new Date(Date.now() - 2 * 86400000).toISOString(), messageCount: 4 },
        { id: 'research-4', title: 'ETF 与股票的基础知识', updatedAt: new Date(Date.now() - 10 * 86400000).toISOString(), messageCount: 8 }
      ]
      const childRun = {
        id: 'child-stock-1', profile: 'stock-analyst', name: '股票子代理', task: '梳理520战法的三步判断流程', status: 'done',
        messages: [
          { id: 'child-user', role: 'user', text: '梳理520战法的三步判断流程' },
          { id: 'child-answer', role: 'assistant', thinking: '先检查趋势证据，再分析信号。',
            tools: [{ id: 'quote', name: 'stock_quote', input: { stockCode: '510300' }, output: '行情预览数据', status: 'done' }],
            text: '## 股票子代理的判断过程\n\n' + Array.from({ length: 22 }, (_, i) => `第 ${i + 1} 步：结合 MA20 方向与价格位置判断趋势，核对回踩信号。`).join('\n\n') + '\n\n```echarts\n{"animation":false,"xAxis":{"type":"category","data":["一","二"]},"yAxis":{"type":"value"},"series":[{"type":"line","data":[1,2]}]}\n```' }
        ]
      }
      window.previewRun = childRun
      class PreviewSocket {
        static OPEN = 1
        static CONNECTING = 0
        constructor() { window.previewSocket = this; this.readyState = 0; setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen() }, 0) }
        deliver(message) { setTimeout(() => { if (this.readyState === 1 && this.onmessage) this.onmessage({ data: JSON.stringify(message) }) }, 0) }
        send(raw) {
          const command = JSON.parse(raw)
          const requestId = command.requestId
          if (command.type === 'ping') this.deliver({ type: 'pong' })
          if (command.type === 'init') this.deliver({ type: 'init', protocolVersion: 1, userId: '42', sessions, settings: {}, models: [
            { provider: 'deepseek', id: 'deepseek-flash', name: 'DeepSeek', supportsImages: false },
            { provider: 'preview', id: 'vision', name: '视觉模型', supportsImages: true, reasoning: true }
          ], providers: [], requestId })
          if (command.type === 'set_model') {
            this.deliver({ type: 'session_updated', sessionId: command.sessionId, model: { provider: command.provider, id: command.modelId } })
            this.deliver({ type: 'ack', command: command.type, requestId })
          }
          if (command.type === 'prompt') {
            window.previewLastPrompt = command
            this.deliver({ type: 'prompt_accepted', sessionId: command.sessionId, requestId })
            this.deliver({ type: 'message_end', sessionId: command.sessionId, message: { id: 'image-user', role: 'user', text: command.text + '\n[Image 1: 16x16]', images: command.images } })
            this.deliver({ type: 'message_end', sessionId: command.sessionId, message: { id: 'image-answer', role: 'assistant', text: '图片已送达预览模型' } })
            this.deliver({ type: 'agent_end', sessionId: command.sessionId })
          }
          if (command.type === 'list_sessions') this.deliver({ type: 'sessions', sessions: sessions.filter(session => session.title.includes(command.query || '')), requestId })
          if (command.type === 'load_session') this.deliver({ type: 'session_state', requestId, session: {
            summary: sessions.find(session => session.id === command.sessionId), isStreaming: false, epoch: 'preview', sequence: 0,
            model: { provider: 'deepseek', id: 'deepseek-flash' }, thinkingLevel: 'low', contextUsage: { percent: 12 },
            messages: [
              { id: 'question', role: 'user', text: '帮我梳理520战法的判断顺序，重点看趋势和回踩信号。', timestamp: today },
              { id: 'answer', role: 'assistant', timestamp: today, thinking: '先说明方法的判断顺序，再把趋势、买点和执行条件分开呈现。',
                tools: [{ id: 'stock-task', name: 'Agent', input: { profile: 'stock-analyst', task: '梳理520战法的三步判断流程' }, output: '已整理趋势、买点与执行条件，以下为界面预览内容。', status: 'done', durationMs: 2400, subagent: childRun }],
                text: '## 先看趋势，再找信号\n\n可以把判断分成三步，避免只盯着一次交叉就下结论。\n\n| 判断步骤 | 重点观察 | 需要补充的信息 |\n| --- | --- | --- |\n| 趋势 | MA20方向与价格位置 | 连续交易日表现 |\n| 买点 | MA5与MA20的关系 | 回踩、粘合与量能 |\n| 执行 | 信号是否得到确认 | 失效条件与风险边界 |\n\n> 单个信号需要结合趋势和后续确认一起理解。\n\n这是界面预览数据，用于检查排版，未连接实时行情服务。' }
            ]
          } })
        }
        close() { this.readyState = 3; if (this.onclose) this.onclose({ code: 1000 }) }
      }
      window.WebSocket = PreviewSocket
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${origin}/agent/chat`, { waitUntil: 'networkidle' })
    await page.getByText('先看趋势，再找信号', { exact: true }).waitFor()
    const composerInput = page.locator('.agent-composer textarea')
    const initialHeight = await page.locator('.agent-composer').evaluate(element => element.getBoundingClientRect().height)
    assert.ok(initialHeight <= 120, 'empty composer should be about two thirds of the previous 162px height')
    const attachment = page.getByRole('button', { name: '上传图片', exact: true })
    const idleBackground = await attachment.evaluate(element => getComputedStyle(element).backgroundColor)
    await attachment.hover()
    await page.waitForFunction(background => getComputedStyle(document.querySelector('.agent-composer__attach')).backgroundColor !== background, idleBackground)
    assert.equal(await attachment.evaluate(element => getComputedStyle(element).borderRadius), '50%')
    await page.locator('.agent-composer').screenshot({ path: path.join(output, 'agent-composer-hover.png') })
    await composerInput.fill('第一行\n第二行\n第三行\n第四行')
    await page.waitForFunction(height => document.querySelector('.agent-composer').getBoundingClientRect().height > height + 40, initialHeight)
    await composerInput.fill(Array.from({ length: 20 }, (_, index) => `第${index + 1}行`).join('\n'))
    await page.waitForFunction(() => {
      const input = document.querySelector('.agent-composer textarea')
      return input.scrollHeight > input.clientHeight && input.clientHeight <= parseFloat(getComputedStyle(input).lineHeight) * 6 + 6
    })
    const cappedHeight = await composerInput.evaluate(element => element.getBoundingClientRect().height)
    await composerInput.fill(Array.from({ length: 40 }, (_, index) => `第${index + 1}行`).join('\n'))
    assert.ok(Math.abs(await composerInput.evaluate(element => element.getBoundingClientRect().height) - cappedHeight) <= 1, 'composer must stop growing after six rows')
    await composerInput.fill('')
    await page.waitForFunction(height => Math.abs(document.querySelector('.agent-composer').getBoundingClientRect().height - height) <= 1, initialHeight)
    await page.locator('.agent-session-item').first().hover()
    const edit = await page.getByRole('button', { name: '重命名对话', exact: true }).first().boundingBox()
    const remove = await page.getByRole('button', { name: '删除对话', exact: true }).first().boundingBox()
    assert.ok(edit && remove && edit.x + edit.width <= remove.x, 'rename and delete actions overlap')
    await page.locator('.agent-conversation').evaluate(element => { element.scrollTop = 0 })
    await page.locator('.agent-chat-page').screenshot({ path: path.join(output, 'agent-chat-conversation-desktop.png') })
    await page.locator('.agent-tool-card__toggle').click()
    await page.getByText('调用参数', { exact: true }).waitFor()
    await page.locator('.agent-tool-card__toggle').click()
    await page.getByRole('button', { name: '查看子代理对话', exact: false }).click()
    await page.getByRole('complementary', { name: '子代理聊天' }).waitFor()
    await page.getByText('股票子代理的判断过程', { exact: true }).waitFor()
    await page.locator('.agent-chat-page').screenshot({ path: path.join(output, 'agent-chat-subagent-light.png') })
    await page.getByRole('button', { name: '切换到暗色主题', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('.agent-chat-page').dataset.agentTheme === 'dark')
    assert.equal(await page.locator('.agent-topbar').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(41, 42, 45)')
    assert.equal(await page.locator('.agent-subagent-panel').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(41, 42, 45)')
    await page.waitForFunction(() => {
      const component = document.querySelector('.agent-chart-card').__vue__
      return component && component.ready && component.chartInstance.getOption().backgroundColor === '#292a2d'
    })
    await page.locator('.agent-chat-page').screenshot({ path: path.join(output, 'agent-chat-subagent-dark.png') })
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByText('先看趋势，再找信号', { exact: true }).waitFor()
    assert.equal(await page.locator('.agent-chat-page').getAttribute('data-agent-theme'), 'dark', 'theme preference survives refresh')
    await page.getByRole('button', { name: '查看子代理对话', exact: false }).click()
    const panelScroll = page.locator('.agent-subagent-panel__scroll')
    await panelScroll.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 })) })
    await page.evaluate(() => {
      const run = { ...window.previewRun, messages: window.previewRun.messages.map(message => message.role === 'assistant' ? { ...message, text: message.text + '\n\n子代理实时更新' } : message) }
      window.previewSocket.deliver({ type: 'tool_update', sessionId: 'research-1', toolCallId: 'stock-task', subagent: run })
    })
    await page.getByText('子代理实时更新', { exact: true }).waitFor({ state: 'attached' })
    await page.waitForTimeout(200)
    assert.equal(await panelScroll.evaluate(el => el.scrollTop), 0, 'child updates preserve paused scroll')
    await page.getByRole('button', { name: '回到最新', exact: true }).click()
    await page.waitForFunction(() => { const el = document.querySelector('.agent-subagent-panel__scroll'); return el.scrollHeight - el.scrollTop - el.clientHeight < 5 })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForFunction(() => document.querySelector('.agent-chart-card').__vue__.ready)
    await page.locator('.agent-chat-page').screenshot({ path: path.join(output, 'agent-chat-subagent-mobile-dark.png') })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile subagent view has no horizontal overflow')
    await page.getByRole('button', { name: '关闭子代理聊天', exact: true }).click()
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.getByRole('button', { name: '切换到亮色主题', exact: true }).click()
    await page.getByRole('button', { name: '新建对话', exact: false }).click()
    await page.getByRole('heading', { name: /从一个问题/ }).waitFor()
    await page.locator('.agent-chat-page').screenshot({ path: path.join(output, 'agent-chat-welcome-desktop.png') })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForFunction(() => document.querySelector('.agent-sidebar').getBoundingClientRect().right <= document.querySelector('.agent-chat-page').getBoundingClientRect().left + 1)
    await page.locator('.agent-chat-page').screenshot({ path: path.join(output, 'agent-chat-mobile.png') })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile page has horizontal overflow')
    await page.getByRole('button', { name: '打开会话列表', exact: true }).click()
    await page.locator('.agent-sidebar.is-mobile-open').waitFor()
    await page.locator('.agent-chat-page').screenshot({ path: path.join(output, 'agent-chat-sidebar-mobile.png') })
    await page.locator('.agent-session-item__main').first().click()
    await page.getByText('先看趋势，再找信号', { exact: true }).waitFor()
    await page.waitForFunction(() => document.querySelector('.agent-sidebar').getBoundingClientRect().right <= document.querySelector('.agent-chat-page').getBoundingClientRect().left + 1)
    await page.locator('.agent-conversation').evaluate(element => { element.scrollTop = 0 })
    await page.locator('.agent-chat-page').screenshot({ path: path.join(output, 'agent-chat-conversation-mobile.png') })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile conversation has horizontal overflow')
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAI0lEQVR4nGO0afrAQApgIkk1w6gG4gATkergYFQDMYDkUAIAVSsBzrxEmLQAAAAASUVORK5CYII=', 'base64')
    await page.locator('input[type=file]').setInputFiles({ name: 'chart.png', mimeType: 'image/png', buffer: png })
    await page.locator('.agent-composer-image .el-image__inner').waitFor()
    assert.equal(await page.getByRole('button', { name: '发送消息', exact: true }).isDisabled(), true)
    assert.equal(await page.getByLabel('选择模型', { exact: true }).count(), 0)
    assert.equal(await page.getByLabel('思考强度', { exact: true }).count(), 0)
    assert.equal(await page.locator('.agent-composer-role, .agent-composer-context, .agent-composer-toolbar').count(), 0)
    const attachmentPlacement = await page.evaluate(() => {
      const box = document.querySelector('.agent-composer').getBoundingClientRect()
      const text = document.querySelector('.agent-composer textarea').getBoundingClientRect()
      const attach = document.querySelector('.agent-composer__attach').getBoundingClientRect()
      const send = document.querySelector('.agent-composer__send').getBoundingClientRect()
      return attach.left >= box.left && attach.right < box.left + box.width / 2
        && attach.top >= text.bottom && attach.bottom <= box.bottom && Math.abs(attach.bottom - send.bottom) <= 1
    })
    assert.ok(attachmentPlacement, 'upload button must sit inside the lower left of the composer, below the text')
    await page.evaluate(() => window.previewSocket.deliver({ type: 'models', models: [
      { provider: 'deepseek', id: 'deepseek-flash', name: 'DeepSeek', supportsImages: true, reasoning: true }
    ] }))
    await page.waitForFunction(() => !document.querySelector('.agent-composer__send').disabled)
    await page.locator('.agent-composer-image .el-image').click()
    await page.locator('.el-image-viewer__wrapper').waitFor()
    await page.locator('.el-image-viewer__close').click()
    await page.locator('.agent-chat-page').screenshot({ path: path.join(output, 'agent-chat-images-mobile.png') })
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'mobile image composer has horizontal overflow')
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
    await page.getByText('图片已送达预览模型', { exact: true }).waitFor()
    assert.equal(await page.locator('.agent-message-images').count(), 1, 'image optimistic bubble is reconciled')
    assert.equal(await page.evaluate(() => window.previewLastPrompt.images.length), 1)
    assert.equal(await page.locator('.agent-composer-image').count(), 0)
    await page.setViewportSize({ width: 1440, height: 1000 })
    const attachImage = async kind => page.evaluate(({ data, kind }) => {
      const bytes = Uint8Array.from(atob(data), character => character.charCodeAt(0))
      const transfer = new DataTransfer()
      transfer.items.add(new File([bytes], 'clipboard.png', { type: 'image/png' }))
      const event = kind === 'paste' ? new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }) : new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })
      document.querySelector('.agent-composer').dispatchEvent(event)
    }, { data: png.toString('base64'), kind })
    await attachImage('paste')
    await page.waitForFunction(() => document.querySelectorAll('.agent-composer-image').length === 1)
    await attachImage('drop')
    await page.waitForFunction(() => document.querySelectorAll('.agent-composer-image').length === 2)
    await page.locator('.agent-chat-page').screenshot({ path: path.join(output, 'agent-chat-images-desktop.png') })
    await page.getByRole('button', { name: '移除图片 1', exact: true }).click()
    assert.equal(await page.locator('.agent-composer-image').count(), 1)
    assert.deepEqual(errors, [], 'browser runtime errors')
    console.log(JSON.stringify({ screenshots: output, checks: ['desktop conversation', 'welcome', 'tool details', 'distinct session actions', 'mobile overflow', 'mobile drawer', 'subagent split view', 'live child updates', 'scroll following', 'theme persistence', 'dark theme', 'mobile subagent', 'image upload and preview', 'model vision gate', 'image-only send', 'image reconciliation', 'image paste and drop', 'mobile image composer', 'attachment inside lower left', 'simplified composer', 'circular attachment hover', 'compact composer', 'bounded autosize'], browserErrors: errors }))
  } finally {
    if (browser) await browser.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
