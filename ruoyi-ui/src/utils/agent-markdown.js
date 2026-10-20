// Vue CLI 4 uses Webpack 4. Use the bundled browser build to avoid ESM/CJS
// named-export resolution through markdown-it's dependency tree.
import MarkdownIt from 'markdown-it/dist/markdown-it.js'
import hljs from 'highlight.js'

const markdown = new MarkdownIt({ html: false, linkify: true, breaks: true })

export function highlightAgentCode(source, language) {
  if (language && hljs.getLanguage(language)) {
    try { return hljs.highlight(language, source, true).value } catch (error) { /* Render unknown or partial code as text. */ }
  }
  return markdown.utils.escapeHtml(source)
}

markdown.options.highlight = highlightAgentCode
markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  tokens[index].attrSet('target', '_blank')
  tokens[index].attrSet('rel', 'noopener noreferrer')
  return renderer.renderToken(tokens, index, options)
}
markdown.renderer.rules.table_open = (tokens, index, options, env, renderer) =>
  `<div class="agent-md-table" tabindex="0">${renderer.renderToken(tokens, index, options)}`
markdown.renderer.rules.table_close = () => '</table></div>\n'
const renderImage = markdown.renderer.rules.image
markdown.renderer.rules.image = (tokens, index, options, env, renderer) => {
  tokens[index].attrSet('loading', 'lazy')
  tokens[index].attrSet('referrerpolicy', 'no-referrer')
  return renderImage(tokens, index, options, env, renderer)
}

// Task lists supplement markdown-it's built-in tables, strikethrough and nested lists.
markdown.core.ruler.after('inline', 'agent-task-list', state => {
  state.tokens.forEach((token, index) => {
    if (token.type !== 'inline' || !state.tokens[index - 2] || state.tokens[index - 2].type !== 'list_item_open') return
    const first = token.children && token.children[0]
    const match = first && first.type === 'text' && first.content.match(/^\[([ xX])\]\s+/)
    if (!match) return
    first.content = first.content.slice(match[0].length)
    const checkbox = new state.Token('html_inline', '', 0)
    checkbox.content = `<input class="agent-task-checkbox" type="checkbox" disabled${match[1].toLowerCase() === 'x' ? ' checked' : ''}> `
    token.children.unshift(checkbox)
    state.tokens[index - 2].attrJoin('class', 'agent-task-list-item')
  })
})

function isFenceClosed(token, lines) {
  const lastLine = token.map && lines[token.map[1] - 1]
  if (lastLine === undefined) return false
  const fence = token.markup[0] === '`' ? '`' : '~'
  return new RegExp(`^ {0,3}${fence}{${token.markup.length},}\\s*$`).test(lastLine)
}

/** Keep chart/code components stable while surrounding Markdown is still streaming. */
export function buildAgentContent(text, streaming) {
  const source = String(text || '').replace(/\r\n?/g, '\n')
  const lines = source.split('\n')
  const env = {}
  const tokens = markdown.parse(source, env)
  const parts = []
  let prose = []
  let fenceIndex = 0
  const flush = () => {
    if (prose.length) {
      parts.push({ id: `markdown-${fenceIndex}`, type: 'markdown', html: markdown.renderer.render(prose, markdown.options, env) })
      prose = []
    }
  }
  tokens.forEach(token => {
    // Nested fences remain valid Markdown; rich chart blocks are emitted at top level.
    if (token.type !== 'fence' || token.level !== 0) {
      prose.push(token)
      return
    }
    flush()
    const language = token.info.trim().split(/\s+/)[0].toLowerCase()
    parts.push({
      id: `fence-${fenceIndex++}`,
      type: ['echarts', 'echart'].includes(language) ? 'chart' : 'code',
      language,
      source: token.content,
      pending: Boolean(streaming && !isFenceClosed(token, lines))
    })
  })
  flush()
  return parts
}

export async function copyAgentText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return } catch (error) { /* Fall back on non-HTTPS deployments. */ }
  }
  const previousFocus = document.activeElement
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  try {
    textarea.select()
    if (!document.execCommand('copy')) throw new Error('复制失败，请手动选择文本')
  } finally {
    document.body.removeChild(textarea)
    if (previousFocus && previousFocus.focus) previousFocus.focus({ preventScroll: true })
  }
}
