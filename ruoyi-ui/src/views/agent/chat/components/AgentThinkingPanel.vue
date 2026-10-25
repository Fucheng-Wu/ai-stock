<template>
  <div class="agent-thinking" :class="{ 'is-open': open }">
    <button type="button" :aria-expanded="open" @click="toggle">
      <i :class="streaming ? 'el-icon-loading' : 'el-icon-cpu'" />
      <span>{{ streaming ? '正在思考' : '思考过程' }}</span>
      <span class="agent-thinking__count">{{ text.length.toLocaleString() }} 字</span>
      <i :class="open ? 'el-icon-arrow-up' : 'el-icon-arrow-down'" />
    </button>
    <div v-if="open" ref="content" class="agent-thinking__content" @scroll="onScroll">{{ text }}</div>
  </div>
</template>

<script>
export default {
  name: 'AgentThinkingPanel',
  props: {
    text: { type: String, default: '' },
    streaming: { type: Boolean, default: false }
  },
  data() {
    return { open: false, followLatest: true }
  },
  watch: {
    streaming: {
      immediate: true,
      handler(streaming) {
        this.open = streaming
        this.followLatest = true
        this.scrollToLatest()
      }
    },
    text() { this.scrollToLatest() },
    open() {
      this.scrollToLatest()
      this.$nextTick(() => this.$emit('layout'))
    }
  },
  methods: {
    toggle() {
      this.open = !this.open
    },
    onScroll() {
      const content = this.$refs.content
      if (content) this.followLatest = content.scrollHeight - content.scrollTop - content.clientHeight < 40
    },
    scrollToLatest() {
      if (!this.open || !this.streaming || !this.followLatest) return
      this.$nextTick(() => {
        const content = this.$refs.content
        if (content) content.scrollTop = content.scrollHeight
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.agent-thinking {
  width: 100%;
  margin: 0 0 9px;
  border-left: 2px solid var(--agent-line, #e5e7eb);

  > button {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 7px;
    padding: 5px 10px;
    border: 0;
    background: transparent;
    color: var(--agent-muted, #6b7280);
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;

    i:last-child { font-size: 9px; }
  }
}
.agent-thinking__count {
  margin-left: auto;
  font-size: 10px;
}
.agent-thinking__content {
  max-height: 260px;
  overflow: auto;
  padding: 4px 12px 9px;
  color: var(--agent-muted, #6b7280);
  font-size: 13px;
  line-height: 1.85;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
