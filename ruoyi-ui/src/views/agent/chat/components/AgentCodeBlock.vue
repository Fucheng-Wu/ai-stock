<template>
  <div class="agent-code-block">
    <div class="agent-code-block__header">
      <span>{{ language || 'text' }}</span>
      <button type="button" @click="copyCode">
        <i :class="copied ? 'el-icon-check' : 'el-icon-copy-document'" />
        {{ copied ? '已复制' : '复制代码' }}
      </button>
    </div>
    <pre tabindex="0"><code class="hljs" v-html="highlighted" /></pre>
  </div>
</template>

<script>
import { copyAgentText, highlightAgentCode } from '@/utils/agent-markdown'

export default {
  name: 'AgentCodeBlock',
  props: {
    source: { type: String, default: '' },
    language: { type: String, default: '' }
  },
  data() {
    return { copied: false, copyTimer: null }
  },
  computed: {
    highlighted() { return highlightAgentCode(this.source, this.language) }
  },
  beforeDestroy() {
    clearTimeout(this.copyTimer)
  },
  methods: {
    async copyCode() {
      try {
        await copyAgentText(this.source)
        this.copied = true
        clearTimeout(this.copyTimer)
        this.copyTimer = setTimeout(() => { this.copied = false }, 1500)
      } catch (error) {
        this.$message.warning('复制失败，请手动选择代码')
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.agent-code-block {
  min-width: 0;
  margin: 14px 0;
  overflow: hidden;
  border: 1px solid var(--agent-line, #e5e7eb);
  border-radius: 12px;
  background: var(--agent-surface, #f3f4f6);
  font-size: 12px;
}
.agent-code-block__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--agent-line, #e5e7eb);
  color: var(--agent-muted, #6b7280);
  font-family: "SFMono-Regular", Consolas, monospace;
  button {
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 11px;
    cursor: pointer;
    &:hover { color: var(--agent-link, #4d6bfe); }
  }
}
pre {
  max-height: 520px;
  margin: 0;
  padding: 16px;
  overflow: auto;
  tab-size: 2;
  white-space: pre;
}
code {
  color: var(--agent-text, #303846);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 13px;
  line-height: 1.7;
}
::v-deep {
  .hljs-comment, .hljs-quote { color: var(--agent-subtle, #818b98); font-style: italic; }
  .hljs-keyword, .hljs-selector-tag, .hljs-literal { color: var(--agent-syntax-keyword, #9659aa); }
  .hljs-string, .hljs-doctag, .hljs-regexp { color: var(--agent-syntax-string, #30804e); }
  .hljs-number, .hljs-built_in, .hljs-attr { color: var(--agent-syntax-number, #b46725); }
  .hljs-title, .hljs-section, .hljs-name { color: var(--agent-link, #3167b8); }
  .hljs-variable, .hljs-template-variable { color: var(--agent-error, #ba4856); }
  .hljs-addition { color: var(--agent-syntax-string, #2b7a44); background: var(--agent-success-soft, #eaf7ee); }
  .hljs-deletion { color: var(--agent-error, #b34343); background: var(--agent-error-soft, #fcecec); }
}
</style>
