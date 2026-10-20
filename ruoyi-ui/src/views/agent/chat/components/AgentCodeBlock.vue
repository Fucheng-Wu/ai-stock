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
  border: 1px solid #e2e4e8;
  border-radius: 12px;
  background: #f7f8fa;
  font-size: 12px;
}
.agent-code-block__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 14px;
  border-bottom: 1px solid #e6e8ec;
  color: #737982;
  font-family: "SFMono-Regular", Consolas, monospace;
  button {
    border: 0;
    background: transparent;
    color: inherit;
    font-size: 11px;
    cursor: pointer;
    &:hover { color: #c65c28; }
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
  color: #303846;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 12px;
  line-height: 1.7;
}
::v-deep {
  .hljs-comment, .hljs-quote { color: #818b98; font-style: italic; }
  .hljs-keyword, .hljs-selector-tag, .hljs-literal { color: #9659aa; }
  .hljs-string, .hljs-doctag, .hljs-regexp { color: #30804e; }
  .hljs-number, .hljs-built_in, .hljs-attr { color: #b46725; }
  .hljs-title, .hljs-section, .hljs-name { color: #3167b8; }
  .hljs-variable, .hljs-template-variable { color: #ba4856; }
  .hljs-addition { color: #2b7a44; background: #eaf7ee; }
  .hljs-deletion { color: #b34343; background: #fcecec; }
}
</style>
