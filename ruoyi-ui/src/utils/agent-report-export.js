import * as echarts from 'echarts'
import { buildAgentContent, highlightAgentCode } from '@/utils/agent-markdown'
import { parseAgentChart } from '@/utils/agent-echarts'

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

function formatTime(value) {
  const timestamp = Number(value)
  if (value == null || !Number.isFinite(timestamp) || !Number.isFinite(new Date(timestamp).getTime())) return '未提供'
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(timestamp)
}

function codeBlock(source, language = '') {
  return `<section class="report-code"><div class="report-code-language">${escapeHtml(language || 'text')}</div><pre><code class="hljs">${highlightAgentCode(source, language)}</code></pre></section>`
}

function chartBlock(source, number) {
  let chart
  try {
    const option = parseAgentChart(source, 'light')
    // Render with bundled ECharts, then embed an inert image: no CDN, scripts or app session required.
    chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 1000, height: 460 })
    // SSR has no DOM for ECharts' aria label; the exported image supplies its own alt text.
    chart.setOption({ ...option, animation: false, aria: { enabled: false } }, true)
    const svg = chart.renderToSVGString({ useViewBox: true })
    const image = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
    return `<figure class="report-chart" data-chart-status="exported"><img src="${image}" alt="报告图表 ${number}" width="1000" height="460"><figcaption>图表 ${number}</figcaption><details><summary>查看图表配置</summary>${codeBlock(source, 'json')}</details></figure>`
  } catch (_) {
    return `<figure class="report-chart" data-chart-status="unavailable"><figcaption>图表 ${number} 暂时无法导出，已保留原始配置。</figcaption>${codeBlock(source, 'json')}</figure>`
  } finally { if (chart) chart.dispose() }
}

const REPORT_STYLES = `
*{box-sizing:border-box}html{color-scheme:light}body{margin:0;padding:40px 20px;background:#f3f5f9;color:#334155;font:15px/1.85 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;overflow-wrap:anywhere}
.report-document{max-width:1040px;margin:auto;border:1px solid #e2e8f0;border-radius:16px;background:#fff;box-shadow:0 8px 32px #17255408;overflow:hidden}.report-header{padding:36px 44px 28px;border-top:4px solid #526bda;border-bottom:1px solid #e9edf4}.report-brand{color:#8b97ab;font-size:10px;letter-spacing:3px}.report-header h1{margin:14px 0 18px;font-size:29px;line-height:1.5;color:#15243a}.report-meta{display:flex;flex-wrap:wrap;gap:8px 24px;color:#8490a3;font-size:11px}.report-kind{color:#526bda}.report-content{padding:32px 44px}.report-content>:first-child{margin-top:0}.report-content>:last-child{margin-bottom:0}
h1,h2,h3,h4,h5,h6{color:#1e293b;line-height:1.5;margin:28px 0 14px}h1{font-size:26px}h2{font-size:22px}h3{font-size:18px}p{margin:0 0 16px}a{color:#4361c2;text-decoration:underline;text-underline-offset:3px}ul,ol{padding-left:26px}li{margin:5px 0}blockquote{margin:20px 0;padding:12px 18px;border-left:3px solid #8da2e6;background:#f5f7fc;color:#64748b;border-radius:0 8px 8px 0}blockquote p:last-child{margin-bottom:0}hr{height:1px;margin:28px 0;border:0;background:#e2e8f0}
.agent-md-table{overflow-x:auto;margin:20px 0;border:1px solid #e2e8f0;border-radius:10px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:12px 15px;min-width:90px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}th{background:#f5f7fb;color:#52617b}tr:last-child td{border-bottom:0}tbody tr:nth-child(even){background:#fafbfd}
pre{overflow-x:auto;margin:0;padding:18px;background:#172033;color:#e2e8f0;font:12px/1.75 Consolas,monospace;tab-size:2}pre code{font:inherit;white-space:pre}.report-code{margin:18px 0;border-radius:10px;overflow:hidden}.report-code-language{padding:8px 16px;background:#253047;color:#a8b6cc;font-size:10px;letter-spacing:1px}:not(pre)>code{padding:3px 6px;border-radius:5px;background:#edf2ff;color:#4361c2;font:12px Consolas,monospace}.hljs-comment,.hljs-quote{color:#98a6bd}.hljs-keyword,.hljs-selector-tag,.hljs-literal{color:#c8a4f0}.hljs-string,.hljs-attribute{color:#9bcdac}.hljs-number,.hljs-attr,.hljs-built_in{color:#e8bc86}.hljs-title,.hljs-function{color:#9cbef1}
img{max-width:100%;height:auto}.report-chart{margin:24px 0;padding:16px;border:1px solid #e2e8f0;border-radius:12px;break-inside:avoid}.report-chart>img{display:block;width:100%;height:auto}.report-chart figcaption{margin-top:10px;color:#94a3b8;font-size:11px}.report-chart details{margin-top:10px;font-size:11px;color:#8490a3}.report-chart summary{cursor:pointer}.report-external-image{display:block;margin:12px 0;padding:12px;border-radius:7px;background:#f8fafc;color:#8490a3;font-size:12px}
.agent-task-list-item{list-style:none}.agent-task-checkbox{margin-left:-20px;accent-color:#526bda}.report-requirements{margin:0 44px 28px;padding-top:20px;border-top:1px solid #e2e8f0;color:#8490a3;font-size:12px}.report-requirements summary{cursor:pointer}.report-requirements p{margin-top:12px;white-space:pre-wrap}.report-footer{padding:18px 44px;border-top:1px solid #e9edf4;color:#94a3b8;font-size:10px;display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap}
@media(max-width:600px){body{padding:12px 8px;font-size:14px}.report-document{border-radius:10px}.report-header{padding:24px 20px}.report-header h1{font-size:23px}.report-content{padding:24px 20px}.report-requirements{margin:0 20px 24px}.report-footer{padding:16px 20px}.report-chart{padding:8px}th,td{padding:10px}h1{font-size:23px}h2{font-size:20px}}
@media print{body{padding:0;background:#fff;font-size:12px}.report-document{max-width:none;border:0;border-radius:0;box-shadow:none}.report-header,.report-content{padding:20px 0}.report-requirements{margin:0 0 20px}.report-footer{padding:12px 0}.agent-md-table{overflow:visible}tr,pre{break-inside:avoid}pre,pre code{white-space:pre-wrap;overflow-wrap:anywhere}a{color:inherit}.report-chart details{display:none}h1,h2,h3{break-after:avoid}p{orphans:3;widows:3}}
`

/** A self-contained document built from report content only; never clone the application's DOM or credentials. */
export function buildReportHtml(report, exportedAt = Date.now()) {
  if (!report || typeof report.content !== 'string' || !report.content.trim()) throw new Error('报告正文为空，暂时无法导出')
  let chartNumber = 0
  const body = buildAgentContent(report.content, false, { offlineImages: true }).map(part => {
    if (part.type === 'markdown') return part.html
    if (part.type === 'chart') return chartBlock(part.source, ++chartNumber)
    return codeBlock(part.source, part.language)
  }).join('\n')
  const title = escapeHtml(report.title || '报告')
  const requirements = report.prompt ? `<details class="report-requirements"><summary>本次报告要求</summary><p>${escapeHtml(report.prompt)}</p></details>` : ''
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${title}</title><style>${REPORT_STYLES}</style></head>
<body><main class="report-document"><header class="report-header"><div class="report-brand">ORANGE / REPORTS</div><h1>${title}</h1><div class="report-meta"><span class="report-kind">${report.scheduleType === 'once' ? '一次性报告' : '定时报告'}</span><span>计划时间：${formatTime(report.scheduledAt)}</span><span>完成时间：${formatTime(report.finishedAt)}</span><span>北京时间</span></div></header><article class="report-content">${body}</article>${requirements}<footer class="report-footer"><span>报告ID：${escapeHtml(report.runId || '未提供')}</span><span>导出于 ${formatTime(exportedAt)} · Asia/Shanghai</span></footer></main></body></html>`
}

export function reportDownloadName(title, extension) {
  const name = Array.from(String(title || '报告').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')).slice(0, 100).join('').replace(/[.\s]+$/, '') || '报告'
  return `${name}.${extension}`
}
