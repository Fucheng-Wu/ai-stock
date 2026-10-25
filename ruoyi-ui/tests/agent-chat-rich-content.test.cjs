const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const test = require('node:test')
const babel = require('@babel/core')
const { parseComponent } = require('vue-template-compiler')
// Node 22 exposes navigator without a browser window. ECharts 5.4 predates that
// combination; hide it during module initialization to select its real SSR mode.
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
let echarts
try {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined })
  echarts = require('echarts')
} finally {
  if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor)
  else delete globalThis.navigator
}

const uiRoot = path.resolve(__dirname, '..')

// Execute the actual Vue 2 scripts and ES modules using the existing Babel toolchain.
// The chat's DOM children and login helper are stubbed for state-machine tests.
function loadSource(relativePath, mocks = {}) {
  const filename = path.resolve(uiRoot, relativePath)
  const file = fs.readFileSync(filename, 'utf8')
  const source = filename.endsWith('.vue') ? parseComponent(file).script.content : file
  const { code } = babel.transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')]
  })
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  const nativeRequire = Module.createRequire(filename)
  loaded.require = request => {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request]
    if (request.startsWith('@/')) return loadSource(`src/${request.slice(2)}.js`, mocks)
    return nativeRequire(request)
  }
  loaded._compile(code, filename)
  return loaded.exports
}

const { buildAgentContent, highlightAgentCode } = loadSource('src/utils/agent-markdown.js')
const { parseAgentChart } = loadSource('src/utils/agent-echarts.js')
const { groupSessions, draftKey, MAX_CACHED_SESSIONS, MAX_VISIBLE_MESSAGES } = loadSource('src/utils/agent-chat-state.js')
const MarkdownComponent = loadSource('src/views/agent/chat/components/AgentMarkdown.vue', { './AgentCodeBlock.vue': {}, './AgentEchart.vue': {} }).default
const ToolCardComponent = loadSource('src/views/agent/chat/components/AgentToolCard.vue').default
let workbenchToken
const Chat = loadSource('src/views/agent/chat/index.vue', {
  './components/AgentMarkdown.vue': {},
  './components/AgentThinkingPanel.vue': {},
  './components/AgentPermissionDialog.vue': {},
  './components/AgentToolCard.vue': {},
  '@/utils/auth': { getToken: () => workbenchToken }
}).default

function prose(text) {
  return buildAgentContent(text, false).filter(part => part.type === 'markdown').map(part => part.html).join('')
}

test('Markdown renders headings, report tables, separators and nested lists', () => {
  const html = prose('# 分析报告\n\n| 证据 | 数值 |\n| --- | --- |\n| MA20 | 12.01 |\n\n---\n\n- 趋势\n  - 向下\n')
  assert.match(html, /<h1>分析报告<\/h1>/)
  assert.match(html, /<table>[\s\S]*<th>证据<\/th>[\s\S]*<td>12\.01<\/td>[\s\S]*<\/table>/)
  assert.match(html, /<hr\s*\/?>/)
  assert.equal((html.match(/<ul>/g) || []).length, 2)
})

test('task lists and links render without executing raw HTML or javascript links', () => {
  const html = prose('- [x] 完成\n- [ ] 待办\n\n[正常链接](https://example.com)\n\n<script>alert(1)</script>\n\n[危险链接](javascript:alert(1))')
  assert.match(html, /type="checkbox" disabled checked/)
  assert.match(html, /type="checkbox" disabled>/)
  assert.match(html, /href="https:\/\/example.com"[^>]*rel="noopener noreferrer"/)
  assert.doesNotMatch(html, /<script>|href="javascript:/i)
  assert.match(html, /&lt;script&gt;/)
})

test('regular code is highlighted and JSON fences are not mistaken for charts', () => {
  const parts = buildAgentContent('```json\n{"series": []}\n```', false)
  assert.equal(parts.length, 1)
  assert.equal(parts[0].type, 'code')
  assert.match(highlightAgentCode('const value = 1', 'javascript'), /hljs-keyword/)
  assert.equal(highlightAgentCode('<script>', 'unknown-language'), '&lt;script&gt;')
})

test('an unfinished streaming chart waits until its fence is complete', () => {
  const partial = '```echarts\n{"series":[{"type":"line","data":[1,2]}]}'
  assert.equal(buildAgentContent(partial, true)[0].pending, true)
  const complete = buildAgentContent(`${partial}\n\`\`\`\n`, true)[0]
  assert.equal(complete.type, 'chart')
  assert.equal(complete.pending, false)
  assert.equal(parseAgentChart(complete.source).series[0].type, 'line')
})

test('appending prose after a completed chart preserves the chart identity and source', () => {
  const content = '# 趋势\n\n```echarts\n{"series":[{"type":"pie","data":[{"name":"A","value":1}]}]}\n```\n'
  const before = buildAgentContent(content, true).find(part => part.type === 'chart')
  const after = buildAgentContent(`${content}\n## 结论\n继续观察`, true).find(part => part.type === 'chart')
  assert.equal(after.id, before.id)
  assert.equal(after.source, before.source)
})

test('invalid JSON and JavaScript chart code produce a recoverable parse error', () => {
  assert.throws(() => parseAgentChart('{"series":'), /JSON/)
  assert.throws(() => parseAgentChart('option = { series: [] }'), /JSON/)
  assert.throws(() => parseAgentChart('{"series": []}'), /series/)
  assert.throws(() => parseAgentChart('{"__proto__":{},"series":[{"type":"pie"}]}'), /无效字段/)
})

test('model chart tooltips use rich text and external navigation/images are removed', () => {
  const option = parseAgentChart(JSON.stringify({
    title: { text: '趋势', link: 'javascript:alert(1)' },
    tooltip: { renderMode: 'html', formatter: '<img src=x onerror=alert(1)>' },
    toolbox: { feature: { dataView: {} } },
    series: [{ type: 'line', symbol: 'image://https://example.com/pixel', data: [1], tooltip: { renderMode: 'html' } }]
  }))
  assert.equal(option.tooltip.renderMode, 'richText')
  assert.equal(option.series[0].tooltip.renderMode, 'richText')
  assert.equal(option.series[0].symbol, 'circle')
  assert.equal(option.title.link, undefined)
  assert.equal(option.toolbox, undefined)
})

for (const [type, data] of [
  ['line', [12, 15, 14]],
  ['pie', [{ name: 'A', value: 12 }, { name: 'B', value: 15 }]],
  ['candlestick', [[10, 11, 9, 12], [11, 10, 9.5, 11.5], [10, 12, 9, 13]]]
]) {
  test(`ECharts actually renders a ${type} chart as SVG`, () => {
    // SVG SSR does not draw into the DOM, but ECharts' ARIA pass still needs
    // an element to hold its accessibility label. Keep the production options.
    const attributes = {}
    const element = {
      setAttribute(name, value) { attributes[name] = value },
      getAttribute(name) { return attributes[name] },
      removeAttribute(name) { delete attributes[name] }
    }
    const chart = echarts.init(element, null, { renderer: 'svg', ssr: true, width: 720, height: 360 })
    try {
      const option = parseAgentChart(JSON.stringify({
        animation: false,
        title: { text: '测试趋势图' },
        ...(type !== 'pie' ? { xAxis: { type: 'category', data: ['一', '二', '三'] }, yAxis: { type: 'value' } } : {}),
        series: [{ type, data }]
      }))
      chart.setOption(option)
      const svg = chart.renderToSVGString()
      assert.match(svg, /^<svg/)
      assert.match(svg, /<path/)
      assert.match(svg, /测试趋势图/)
      assert.match(attributes['aria-label'], /测试趋势图/)
    } finally {
      chart.dispose()
    }
  })
}

function createChatState() {
  const instance = {
    ...Chat.data(),
    $set(target, key, value) { target[key] = value },
    $delete(target, key) { delete target[key] },
    $nextTick(callback) { callback() },
    $refs: {},
    $message: { error() {}, warning() {} }
  }
  Object.entries(Chat.methods).forEach(([name, method]) => { instance[name] = method.bind(instance) })
  Object.entries(Chat.computed).forEach(([name, getter]) => { Object.defineProperty(instance, name, { configurable: true, get: () => getter.call(instance) }) })
  instance.isNearBottom = () => false
  instance.scrollToBottom = () => {}
  const state = {
    summary: { id: 'session', title: '测试' },
    messages: [instance.normalizeMessage({ id: 'user-1', role: 'user', text: '分析西藏珠峰' })],
    streamMessageId: '',
    isStreaming: false
  }
  instance.sessionStates.session = state
  instance.activeSessionId = 'session'
  const emit = event => instance.applyAgentEvent({ sessionId: 'session', ...event })
  return { instance, state, emit }
}

test('two tool calls, intermediate message_end and the final answer stay in one live reply', () => {
  const { state, emit } = createChatState()
  const search = { id: 'search-1', name: 'stock_search', status: 'running' }
  const analyze = { id: 'analyze-1', name: 'stock_analyze', status: 'running' }
  emit({ type: 'agent_start' })
  emit({ type: 'tool_start', tool: search })
  emit({ type: 'message_end', message: { id: 'assistant-1', role: 'assistant', text: '', tools: [search] } })
  assert.equal(state.streamMessageId, 'assistant-1')
  emit({ type: 'tool_end', toolCallId: search.id, output: '已找到', isError: false })
  emit({ type: 'text_delta', delta: '已找到西藏珠峰。' })
  emit({ type: 'tool_start', tool: analyze })
  emit({ type: 'message_end', message: {
    id: 'assistant-1', role: 'assistant', text: '已找到西藏珠峰。', tools: [{ ...search, status: 'done' }, analyze]
  } })
  emit({ type: 'tool_end', toolCallId: analyze.id, output: '分析完成', isError: false })
  emit({ type: 'text_delta', delta: '\n\n# 分析结果' })
  const reply = state.messages[1]
  assert.equal(state.messages.length, 2)
  assert.equal(reply.text, '已找到西藏珠峰。\n\n# 分析结果')
  assert.equal(reply.tools.length, 2)
  assert.equal(reply.tools[1].status, 'done')
  assert.equal(reply.tools[1].output, '分析完成')
  emit({ type: 'agent_end' })
  assert.equal(state.isStreaming, false)
  assert.equal(state.streamMessageId, '')
})

test('a late tool result updates its original reply without creating another bubble', () => {
  const { state, emit } = createChatState()
  emit({ type: 'tool_start', tool: { id: 'tool-1', name: 'stock_quote', status: 'running' } })
  emit({ type: 'agent_end' })
  emit({ type: 'tool_end', toolCallId: 'tool-1', output: '结果', isError: false })
  assert.equal(state.messages.length, 2)
  assert.equal(state.messages[1].tools[0].output, '结果')
  assert.equal(state.messages[1].tools[0].status, 'done')
})

test('a new user question starts a new reply after the previous run finishes', () => {
  const { instance, state, emit } = createChatState()
  emit({ type: 'text_delta', delta: '第一轮' })
  emit({ type: 'agent_end' })
  state.messages.push(instance.normalizeMessage({ id: 'user-2', role: 'user', text: '再分析一只' }))
  emit({ type: 'agent_start' })
  emit({ type: 'text_delta', delta: '第二轮' })
  assert.deepEqual(state.messages.map(item => item.role), ['user', 'assistant', 'user', 'assistant'])
  assert.equal(state.messages[1].text, '第一轮')
  assert.equal(state.messages[3].text, '第二轮')
})

test('loading a new streaming user turn does not attach it to an earlier assistant reply', () => {
  const { instance } = createChatState()
  instance.installSnapshot({
    summary: { id: 'session', title: '历史会话' }, isStreaming: true,
    messages: [
      { id: 'old-reply', role: 'assistant', text: '以前的答案' },
      { id: 'new-user', role: 'user', text: '新问题' }
    ]
  })
  const state = instance.sessionStates.session
  assert.equal(state.streamMessageId, '')
  instance.applyAgentEvent({ type: 'text_delta', sessionId: 'session', delta: '新答案' })
  assert.equal(state.messages[0].text, '以前的答案')
  assert.equal(state.messages[2].text, '新答案')
})

test('switching accounts clears previous messages and blocks sends on the old connection', () => {
  const { instance } = createChatState()
  let closes = 0
  let reconnects = 0
  instance.connectionToken = 'old-user-token'
  instance.connectionState = 'connected'
  instance.socketClient = { close() { closes++ }, send() { assert.fail('old socket must not send') } }
  instance.sessions = [{ id: 'session', title: 'Previous user' }]
  instance.inputText = 'private draft'
  instance.pendingPrompt = 'private pending prompt'
  instance.permissionRequests = [{ id: 'previous-permission' }]
  instance.connectSocket = () => { reconnects++ }
  workbenchToken = 'new-user-token'
  try {
    assert.equal(instance.sendSocket({ type: 'prompt', text: 'new question' }), false)
    assert.equal(closes, 1)
    assert.equal(reconnects, 1)
    assert.equal(instance.socketClient, null)
    assert.deepEqual(instance.sessions, [])
    assert.deepEqual(instance.sessionStates, {})
    assert.equal(instance.activeSessionId, null)
    assert.equal(instance.inputText, '')
    assert.equal(instance.pendingPrompt, '')
    assert.deepEqual(instance.permissionRequests, [])
  } finally {
    workbenchToken = undefined
  }
})

test('an authentication failure clears visible history and closes the connection', () => {
  const { instance } = createChatState()
  const errors = []
  instance.$message = { error(message) { errors.push(message) } }
  instance.handleServerMessage({ type: 'error', code: 'AUTH_REQUIRED', message: '登录已失效' })
  assert.deepEqual(instance.sessionStates, {})
  assert.equal(instance.activeSessionId, null)
  assert.equal(instance.connectionState, 'auth-expired')
  assert.deepEqual(errors, ['登录已失效'])
})

test('a rejected prompt releases the composer and retry sends exactly once', () => {
  const { instance, state } = createChatState()
  const sent = []
  instance.sendSocket = message => { sent.push(message); instance.trackRequest(message); return true }
  instance.sendPromptToActive('请分析600519')
  const failedId = sent[0].requestId
  assert.equal(state.isStreaming, true)
  instance.handleServerMessage({ type: 'error', code: 'REQUEST_FAILED', sessionId: 'session', requestId: failedId, message: '服务忙' })
  assert.equal(state.isStreaming, false)
  assert.equal(state.delivery, 'rejected')
  assert.equal(state.messages.filter(item => item.text === '请分析600519').length, 0)
  instance.retryFailedPrompt()
  assert.equal(sent.length, 2)
  assert.equal(sent[1].text, '请分析600519')
  assert.equal(state.messages.filter(item => item.text === '请分析600519').length, 1)
  instance.clearPendingRequests()
})

test('disconnecting with an unacknowledged prompt retains it without automatically resending', () => {
  const { instance, state } = createChatState()
  let sends = 0
  instance.sendSocket = message => { sends++; instance.trackRequest(message); return true }
  instance.sendPromptToActive('不要丢失的问题')
  instance.clearPendingRequests('连接中断')
  assert.equal(state.delivery, 'unknown')
  assert.equal(state.isStreaming, false)
  instance.focusComposer = () => {}
  instance.retryFailedPrompt()
  assert.equal(instance.inputText, '不要丢失的问题')
  assert.equal(sends, 1)
})

test('failed history loads release the spinner and service outages preserve the conversation and draft', () => {
  const { instance, state } = createChatState()
  instance.loadingSessionIds.session = true
  instance.trackRequest({ type: 'load_session', sessionId: 'session', requestId: 'load-failed' })
  instance.handleServerMessage({ type: 'error', code: 'REQUEST_FAILED', requestId: 'load-failed', message: '载入失败' })
  assert.equal(instance.loadingSessionIds.session, undefined)
  assert.equal(instance.historyErrors.session, '载入失败')
  instance.inputText = '正在编辑的草稿'
  instance.handleServerMessage({ type: 'error', code: 'SERVICE_UNAVAILABLE', message: '服务暂不可用' })
  assert.equal(instance.connectionState, 'service-unavailable')
  assert.equal(instance.sessionStates.session, state)
  assert.equal(instance.inputText, '正在编辑的草稿')
})

test('drafts are isolated by user and conversation, and remain until a prompt is acknowledged', () => {
  const previousWindow = globalThis.window
  const storage = new Map()
  globalThis.window = { sessionStorage: { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key) || null, removeItem: key => storage.delete(key) } }
  workbenchToken = 'draft-owner-token'
  const { instance, state } = createChatState()
  instance.connectionToken = workbenchToken
  instance.draftUserId = '42'
  try {
    instance.inputText = '第一会话草稿'
    instance.switchDraft('second')
    assert.equal(instance.inputText, '')
    instance.inputText = '第二会话草稿'
    instance.switchDraft('session')
    assert.equal(instance.inputText, '第一会话草稿')
    state.delivery = 'sending'
    state.lastPrompt = '等待确认的问题'
    instance.inputText = ''
    instance.saveDraft()
    assert.equal(storage.get(draftKey('42', 'session')), '等待确认的问题')
    instance.handleServerMessage({ type: 'prompt_accepted', sessionId: 'session' })
    assert.equal(storage.has(draftKey('42', 'session')), false)
    instance.resetIdentityConnection()
    instance.draftUserId = '43'
    assert.equal(instance.readDraft('second'), '')
    assert.equal(storage.get(draftKey('42', 'second')), '第二会话草稿')
    assert.ok(![...storage.keys()].some(key => key.includes(workbenchToken)))
  } finally {
    globalThis.window = previousWindow
    workbenchToken = undefined
  }
})

test('stream batching preserves tool and message boundaries', () => {
  const { instance } = createChatState()
  const applied = []
  instance.applyAgentEvent = event => applied.push(event)
  instance.queueAgentEvent({ type: 'text_delta', sessionId: 'session', delta: '第一' })
  instance.queueAgentEvent({ type: 'text_delta', sessionId: 'session', delta: '段' })
  instance.queueAgentEvent({ type: 'tool_start', sessionId: 'session', tool: { id: 'tool' } })
  instance.queueAgentEvent({ type: 'text_delta', sessionId: 'session', delta: '第二段' })
  instance.flushAgentEvents()
  assert.deepEqual(applied.map(event => event.type), ['text_delta', 'tool_start', 'text_delta'])
  assert.equal(applied[0].delta, '第一段')
  assert.equal(applied[2].delta, '第二段')
})

test('history has a bounded render window and idle conversation caches are evicted', () => {
  const { instance, state } = createChatState()
  state.messages = Array.from({ length: 100 }, (_, index) => instance.normalizeMessage({ id: `new-${index}`, role: 'user', text: '消息' }))
  instance.handleServerMessage({ type: 'history_page', sessionId: 'session', nextBefore: 'older', messages: Array.from({ length: 40 }, (_, index) => ({ id: `old-${index}`, role: 'user', text: '历史' })) })
  assert.equal(state.messages.length, MAX_VISIBLE_MESSAGES)
  assert.equal(state.hasNewer, true)
  for (let index = 0; index < 12; index++) instance.installSnapshot({ summary: { id: `idle-${index}`, title: '缓存' }, messages: [], isStreaming: false })
  assert.equal(Object.keys(instance.sessionStates).length, MAX_CACHED_SESSIONS)
  assert.equal(instance.sessionStates.session, state)
})

test('events for unopened conversations update their title without loading their history', () => {
  const { instance } = createChatState()
  instance.loadSession = () => assert.fail('unopened history must not be loaded')
  instance.applyAgentEvent({ type: 'session_updated', sessionId: 'other', summary: { id: 'other', title: '其他会话' } })
  instance.applyAgentEvent({ type: 'text_delta', sessionId: 'other', delta: '内容' })
  assert.equal(instance.sessions.find(item => item.id === 'other').title, '其他会话')
})

test('session groups use local calendar boundaries and stale searches cannot overwrite newer results', () => {
  const now = new Date(2026, 9, 25, 12).getTime()
  const groups = groupSessions([{ id: 'today', updatedAt: new Date(2026, 9, 25, 1).toISOString() }, { id: 'week', updatedAt: new Date(2026, 9, 20, 1).toISOString() }, { id: 'old', updatedAt: new Date(2026, 8, 1).toISOString() }], now)
  assert.deepEqual(groups.map(group => group.label), ['今天', '近七天', '更早'])
  const { instance } = createChatState()
  instance.sessionQuery = '520'
  instance.latestSessionRequestId = 'new-search'
  instance.trackRequest({ type: 'list_sessions', query: '520', requestId: 'old-search' })
  instance.trackRequest({ type: 'list_sessions', query: '520', requestId: 'new-search' })
  instance.handleServerMessage({ type: 'sessions', requestId: 'new-search', sessions: [{ id: 'new', title: '520新结果' }] })
  instance.handleServerMessage({ type: 'sessions', requestId: 'old-search', sessions: [{ id: 'old', title: '520旧结果' }] })
  assert.deepEqual(instance.sessions.map(session => session.id), ['new'])
})

test('request timeouts release history loading and treat unacknowledged sends as uncertain', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { instance, state } = createChatState()
  instance.loadingSessionIds.session = true
  instance.trackRequest({ type: 'load_session', sessionId: 'session', requestId: 'timed-load' })
  t.mock.timers.tick(15001)
  assert.equal(instance.loadingSessionIds.session, undefined)
  assert.match(instance.historyErrors.session, /超时/)
  instance.trackRequest({ type: 'prompt', sessionId: 'session', requestId: 'timed-prompt', text: '未确认的问题' })
  t.mock.timers.tick(20001)
  assert.equal(state.delivery, 'unknown')
  assert.equal(state.lastPrompt, '未确认的问题')
  assert.equal(state.isStreaming, false)
})

test('a rejected send never attaches its error to an earlier answer', () => {
  const { instance, state, emit } = createChatState()
  state.messages.push(instance.normalizeMessage({ id: 'old-answer', role: 'assistant', text: '之前的答案' }))
  instance.sendSocket = message => { instance.trackRequest(message); return true }
  instance.sendPromptToActive('新问题')
  const requestId = Object.keys(instance.pendingRequests)[0]
  instance.handleServerMessage({ type: 'error', requestId, sessionId: 'session', code: 'REQUEST_FAILED', message: '保存失败' })
  emit({ type: 'agent_end', error: '保存失败' })
  assert.equal(state.messages.length, 2)
  assert.equal(state.messages[1].error, '')
  assert.equal(state.delivery, 'rejected')
})

test('stop requests cannot be repeated while pending and completion releases the stop state', () => {
  const { instance, state, emit } = createChatState()
  state.isStreaming = true
  const sent = []
  instance.sendSocket = message => { sent.push(message); instance.trackRequest(message); return true }
  instance.abortGeneration()
  instance.abortGeneration()
  assert.equal(sent.length, 1)
  assert.equal(state.stopRequested, true)
  emit({ type: 'agent_end' })
  instance.handleServerMessage({ type: 'request_complete', sessionId: 'session', requestId: sent[0].requestId })
  assert.equal(state.stopRequested, false)
  assert.equal(state.isStreaming, false)
  assert.match(state.sendError, /已停止/)
  assert.deepEqual(instance.pendingRequests, {})
})

test('typing a follow-up while the first conversation is being created keeps that draft', () => {
  const { instance } = createChatState()
  instance.activeSessionId = null
  instance.creatingSession = true
  instance.pendingPrompt = '第一条问题'
  instance.inputText = '创建过程中继续写的草稿'
  const sent = []
  instance.sendSocket = message => { sent.push(message); return true }
  instance.handleServerMessage({ type: 'session_created', session: { summary: { id: 'created', title: '新对话' }, messages: [], isStreaming: false } })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].text, '第一条问题')
  assert.equal(instance.inputText, '创建过程中继续写的草稿')
})

test('sequenced events reject duplicates and replay missing text only after a fresh snapshot', () => {
  const { instance } = createChatState()
  const snapshot = (text, sequence) => ({ summary: { id: 'session', title: '同步' }, epoch: 'run-1', sequence, isStreaming: true, messages: [{ id: 'user', role: 'user', text: '问题' }, { id: 'reply', role: 'assistant', text }] })
  instance.installSnapshot(snapshot('A', 1))
  instance.applyAgentEvent({ type: 'text_delta', sessionId: 'session', epoch: 'run-1', sequence: 2, delta: 'B' })
  instance.applyAgentEvent({ type: 'text_delta', sessionId: 'session', epoch: 'run-1', sequence: 2, delta: 'B' })
  assert.equal(instance.activeState.messages[1].text, 'AB')
  let loads = 0
  instance.loadSession = id => { loads++; instance.loadingSessionIds[id] = true }
  instance.applyAgentEvent({ type: 'text_delta', sessionId: 'session', epoch: 'run-1', sequence: 4, delta: 'D' })
  assert.equal(loads, 1)
  assert.equal(instance.activeState.messages[1].text, 'AB')
  instance.installSnapshot(snapshot('ABC', 3))
  assert.equal(instance.activeState.messages[1].text, 'ABCD')
  assert.equal(instance.activeState.sequence, 4)
  instance.installSnapshot(snapshot('old', 1))
  assert.equal(instance.activeState.messages[1].text, 'ABCD')
})

test('a changed session generation and stale load responses cannot overwrite the current stream', () => {
  const { instance } = createChatState()
  instance.installSnapshot({ summary: { id: 'session' }, messages: [], epoch: 'old-run', sequence: 10, isStreaming: false })
  instance.loadSession = id => { instance.loadingSessionIds[id] = true }
  instance.applyAgentEvent({ type: 'text_delta', sessionId: 'session', epoch: 'new-run', sequence: 1, delta: '新的回复' })
  instance.latestLoadRequests.session = 'load-current'
  instance.installSnapshot({ summary: { id: 'session' }, messages: [], epoch: 'old-run', sequence: 11 }, 'load-stale')
  assert.equal(instance.activeState.epoch, 'old-run')
  instance.installSnapshot({ summary: { id: 'session' }, messages: [{ id: 'new-user', role: 'user', text: '新问题' }], isStreaming: true, epoch: 'new-run', sequence: 0 }, 'load-current')
  assert.equal(instance.activeState.epoch, 'new-run')
  assert.equal(instance.activeState.messages[1].text, '新的回复')
  assert.equal(instance.loadingSessionIds.session, undefined)
})

test('batching retains sequence boundaries for stream recovery', () => {
  const { instance } = createChatState()
  const applied = []
  instance.applyAgentEvent = event => applied.push(event)
  instance.queueAgentEvent({ type: 'text_delta', sessionId: 'session', epoch: 'run', sequence: 1, delta: 'A' })
  instance.queueAgentEvent({ type: 'text_delta', sessionId: 'session', epoch: 'run', sequence: 2, delta: 'B' })
  instance.flushAgentEvents()
  assert.deepEqual(applied.map(event => event.sequence), [1, 2])
})

test('Markdown rendering is throttled while streaming and immediately flushes the final answer', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const component = { text: '第一段', streaming: true, $nextTick: callback => callback(), $emit() {} }
  Object.assign(component, MarkdownComponent.data.call(component))
  Object.entries(MarkdownComponent.methods).forEach(([name, method]) => { component[name] = method.bind(component) })
  component.text = '持续更新'
  MarkdownComponent.watch.text.call(component)
  t.mock.timers.tick(59)
  assert.equal(component.renderedText, '第一段')
  t.mock.timers.tick(1)
  assert.equal(component.renderedText, '持续更新')
  component.text = '最终答案'
  component.streaming = false
  MarkdownComponent.watch.streaming.call(component)
  assert.equal(component.renderedText, '最终答案')
  assert.equal(component.renderedStreaming, false)
})

test('tool output defaults to a bounded preview with explicit expansion', () => {
  const component = { tool: { name: 'Agent', status: 'done', output: 'x'.repeat(15000), durationMs: 2400 }, now: Date.now(), ...ToolCardComponent.data() }
  assert.equal(ToolCardComponent.computed.output.call(component).length, 12000)
  assert.equal(ToolCardComponent.computed.duration.call(component), '2.4 秒')
  component.showFullOutput = true
  assert.equal(ToolCardComponent.computed.output.call(component).length, 15000)
})
