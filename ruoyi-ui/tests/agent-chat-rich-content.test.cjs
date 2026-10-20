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
// Only the chat's DOM child and login helper are stubbed for state-machine tests.
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
const Chat = loadSource('src/views/agent/chat/index.vue', {
  './components/AgentMarkdown.vue': {},
  '@/utils/auth': { getToken: () => undefined }
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
    $nextTick(callback) { callback() }
  }
  Object.entries(Chat.methods).forEach(([name, method]) => { instance[name] = method.bind(instance) })
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
