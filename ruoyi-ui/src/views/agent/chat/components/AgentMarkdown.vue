<template>
  <div class="agent-rich-content" @load.capture="notifyLayout">
    <template v-for="part in parts">
      <agent-echart v-if="part.type === 'chart'" :key="part.id" :source="part.source" :pending="part.pending" @layout="notifyLayout" />
      <agent-code-block v-else-if="part.type === 'code'" :key="part.id" :source="part.source" :language="part.language" />
      <div v-else :key="part.id" class="agent-rich-content__prose" v-html="part.html" />
    </template>
  </div>
</template>

<script>
import { buildAgentContent } from '@/utils/agent-markdown'
import AgentCodeBlock from './AgentCodeBlock.vue'
import AgentEchart from './AgentEchart.vue'

export default {
  name: 'AgentMarkdown',
  components: { AgentCodeBlock, AgentEchart },
  props: {
    text: { type: String, default: '' },
    streaming: { type: Boolean, default: false }
  },
  data() { return { renderedText: this.text, renderedStreaming: this.streaming, renderTimer: null } },
  computed: {
    parts() { return buildAgentContent(this.renderedText, this.renderedStreaming) }
  },
  watch: {
    text() { this.scheduleRender() },
    streaming() { this.scheduleRender() }
  },
  beforeDestroy() { clearTimeout(this.renderTimer) },
  methods: {
    scheduleRender() {
      if (!this.streaming) { clearTimeout(this.renderTimer); this.flushContent() }
      else if (!this.renderTimer) this.renderTimer = setTimeout(() => this.flushContent(), 60)
    },
    flushContent() {
      this.renderTimer = null
      this.renderedText = this.text
      this.renderedStreaming = this.streaming
      this.$nextTick(() => this.notifyLayout())
    },
    notifyLayout() { this.$emit('layout') }
  }
}
</script>

<style lang="scss" scoped>
.agent-rich-content {
  min-width: 0;
  color: #374151;
  font-size: 15px;
  line-height: 1.9;
  overflow-wrap: anywhere;
}
.agent-rich-content__prose {
  ::v-deep {
    > :first-child { margin-top: 0; }
    > :last-child { margin-bottom: 0; }
    p { margin: 0 0 14px; }
    h1, h2, h3, h4, h5, h6 {
      margin: 26px 0 12px;
      color: #111827;
      font-weight: 650;
      line-height: 1.5;
    }
    h1 { font-size: 25px; }
    h2 { font-size: 21px; }
    h3 { font-size: 17px; }
    h4, h5, h6 { font-size: 15px; }
    strong { font-weight: 650; color: #111827; }
    a { color: #4d6bfe; text-decoration: underline; text-underline-offset: 3px; }
    ul, ol { margin: 10px 0 16px; padding-left: 26px; }
    li { padding-left: 3px; margin: 5px 0; }
    li > p { margin: 6px 0; }
    li > ul, li > ol { margin: 5px 0; }
    hr { height: 1px; margin: 26px 0; border: 0; background: #e5e7eb; }
    blockquote {
      margin: 16px 0;
      padding: 5px 16px;
      border-left: 3px solid #dbe4ff;
      background: #f8fafc;
      border-radius: 0 8px 8px 0;
      color: #6b7280;
      p:last-child { margin-bottom: 0; }
    }
    :not(pre) > code {
      padding: 3px 6px;
      border-radius: 5px;
      background: #edf2ff;
      color: #4d6bfe;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.86em;
      white-space: break-spaces;
    }
    pre {
      max-height: 520px;
      overflow: auto;
      padding: 16px;
      border-radius: 10px;
      background: #f4f5f7;
      font-size: 12px;
      line-height: 1.7;
    }
    img { display: block; max-width: 100%; height: auto; margin: 14px 0; border-radius: 8px; }
    .agent-md-table { max-width: 100%; margin: 20px 0; overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 12px; }
    table { width: 100%; margin: 0; border-spacing: 0; border-collapse: collapse; font-size: 13px; line-height: 1.7; }
    th, td { min-width: 100px; padding: 13px 16px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
    th { background: #f6f7f9; color: #6b7280; font-weight: 600; white-space: nowrap; }
    tr:last-child td { border-bottom: 0; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    .agent-task-list-item { list-style: none; }
    .agent-task-checkbox { margin: 0 5px 0 -20px; accent-color: #4d6bfe; vertical-align: middle; }
    .hljs-comment { color: #818b98; }
    .hljs-keyword, .hljs-literal { color: #9659aa; }
    .hljs-string { color: #30804e; }
    .hljs-number, .hljs-attr { color: #b46725; }
  }
}
@media (max-width: 600px) {
  .agent-rich-content { font-size: 14px; }
  .agent-rich-content__prose ::v-deep {
    h1 { font-size: 21px; }
    h2 { font-size: 18px; }
    th, td { padding: 9px 11px; }
  }
}
</style>
