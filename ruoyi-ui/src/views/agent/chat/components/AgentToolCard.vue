<template>
  <div class="agent-tool-card" :class="'is-' + tool.status">
    <button class="agent-tool-card__toggle" type="button" :aria-expanded="open" @click="toggle">
      <span class="agent-tool-card__icon"><i :class="tool.status === 'running' ? 'el-icon-loading' : tool.status === 'error' ? 'el-icon-warning-outline' : 'el-icon-check'" /></span>
      <span class="agent-tool-card__heading"><strong>{{ description }}</strong><small>{{ preview }}</small></span>
      <span class="agent-tool-card__status">{{ tool.status === 'running' ? '执行中' : tool.status === 'error' ? '执行失败' : '已完成' }}<small v-if="duration">{{ duration }}</small></span>
      <i class="agent-tool-card__chevron" :class="open ? 'el-icon-arrow-up' : 'el-icon-arrow-down'" />
    </button>
    <div v-if="open" class="agent-tool-card__details">
      <div v-if="input"><span>调用参数</span><pre tabindex="0">{{ input }}</pre></div>
      <div v-if="tool.output">
        <span>执行结果</span><pre tabindex="0">{{ output }}</pre>
        <button v-if="tool.output.length > outputLimit" type="button" class="agent-tool-card__more" @click="showFullOutput = !showFullOutput">{{ showFullOutput ? '收起完整输出' : '当前仅展示末尾12,000字 · 展开全部' }}</button>
      </div>
      <p v-if="!input && !tool.output">正在等待工具返回结果…</p>
    </div>
  </div>
</template>

<script>
import { toolDescription, toolPreview } from '@/utils/agent-chat-state'

export default {
  name: 'AgentToolCard',
  props: { tool: { type: Object, required: true }, now: { type: Number, default: () => Date.now() } },
  data() { return { open: false, showFullOutput: false, outputLimit: 12000 } },
  computed: {
    description() { return toolDescription(this.tool) },
    preview() { return toolPreview(this.tool) },
    input() {
      if (this.tool.input === undefined || this.tool.input === null) return ''
      return typeof this.tool.input === 'string' ? this.tool.input : JSON.stringify(this.tool.input, null, 2)
    },
    output() { return this.showFullOutput ? this.tool.output : (this.tool.output || '').slice(-this.outputLimit) },
    duration() {
      const ms = this.tool.durationMs === undefined && this.tool.status === 'running' && this.tool.startedAt ? this.now - new Date(this.tool.startedAt).getTime() : this.tool.durationMs
      return Number.isFinite(ms) ? `${Math.max(0, ms / 1000).toFixed(1)} 秒` : ''
    }
  },
  methods: {
    toggle() { this.open = !this.open; this.$nextTick(() => this.$emit('layout')) }
  }
}
</script>

<style lang="scss" scoped>
.agent-tool-card { margin: 12px 0; overflow: hidden; border: 1px solid #e5e7eb; border-radius: 14px; background: #f8fafc; }
.agent-tool-card__toggle { display: flex; width: 100%; align-items: center; gap: 12px; padding: 14px; border: 0; background: transparent; font-family: inherit; text-align: left; cursor: pointer; &:hover { background: #f3f4f6; } &:focus-visible { outline: 2px solid #4d6bfe; outline-offset: -3px; } }
.agent-tool-card__icon { display: grid; width: 32px; height: 32px; flex: 0 0 32px; place-items: center; border: 1px solid #d5e9dd; border-radius: 10px; background: #edf6ef; color: #397657; font-size: 15px; }
.agent-tool-card__heading { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 5px; strong { overflow: hidden; color: #374151; font-size: 13px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; } small { overflow: hidden; color: #6b7280; font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; } }
.agent-tool-card__status { display: flex; flex-shrink: 0; flex-direction: column; align-items: flex-end; gap: 5px; color: #63806b; font-size: 11px; white-space: nowrap; small { color: #9ca3af; font-size: 11px; font-variant-numeric: tabular-nums; } }
.agent-tool-card__chevron { color: #9ca3af; font-size: 11px; }
.is-running .agent-tool-card__icon { border-color: #dbe4ff; background: #edf2ff; color: #4d6bfe; }
.is-running .agent-tool-card__status { color: #4d6bfe; }
.is-error .agent-tool-card__icon { border-color: #fecaca; background: #fef2f2; color: #b91c1c; }
.is-error .agent-tool-card__status { color: #b91c1c; }
.agent-tool-card__details { display: grid; gap: 14px; padding: 15px 16px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; span { color: #6b7280; font-size: 11px; } pre { max-height: 280px; margin: 7px 0 0; padding: 12px; overflow: auto; border: 1px solid #e5e7eb; border-radius: 9px; background: #f3f4f6; color: #374151; font-family: Consolas, monospace; font-size: 12px; line-height: 1.8; overflow-wrap: anywhere; white-space: pre-wrap; } }
.agent-tool-card__more { margin-top: 9px; padding: 3px 0; border: 0; background: transparent; color: #4d6bfe; font-size: 12px; cursor: pointer; }
@media (max-width: 600px) { .agent-tool-card__toggle { gap: 9px; padding: 12px 10px; } .agent-tool-card__heading strong { font-size: 12px; } }
</style>
