<template>
  <aside class="agent-subagent-panel" aria-label="子代理聊天">
    <header class="agent-subagent-panel__header">
      <i :class="status === 'running' ? 'el-icon-loading' : 'el-icon-user'" />
      <div><strong>{{ title }}</strong><small>子代理 · {{ status === 'running' ? '执行中' : status === 'error' ? '执行失败或已取消' : '已完成' }}</small></div>
      <button class="agent-icon-button" type="button" aria-label="关闭子代理聊天" @click="$emit('close')"><i class="el-icon-close" /></button>
    </header>
    <nav v-if="agents.length > 1" class="agent-subagent-panel__tabs" aria-label="切换子代理">
      <button v-for="agent in agents" :key="agent.id" type="button" :aria-pressed="agent.id === tool.id" @click="$emit('select', agent.id)">{{ agent.subagent ? agent.subagent.name : (agent.input || {}).profile || '子代理' }} · {{ agent.status === 'running' ? '执行中' : agent.status === 'error' ? '失败' : '已完成' }}</button>
    </nav>
    <div ref="messageScroller" class="agent-subagent-panel__scroll" tabindex="0" @scroll="handleConversationScroll" @wheel.passive="handleScrollWheel" @touchstart.passive="handleScrollTouchStart" @touchmove.passive="handleScrollTouchMove" @keydown="handleScrollKey">
      <div ref="messageContent" class="agent-subagent-panel__content">
        <div v-if="!messages.some(message => message.role === 'user')" class="agent-user-bubble">{{ (run && run.task) || (tool.input || {}).task || '正在启动子代理…' }}</div>
        <article v-for="message in messages" :key="message.id" class="agent-subagent-message" :class="'is-' + message.role">
          <div class="agent-message__author">{{ message.role === 'user' ? '委派任务' : title }}</div>
          <div v-if="message.images && message.images.length" class="agent-subagent-images"><el-image v-for="(image, index) in message.images" :key="index" :src="imageSource(image)" :preview-src-list="message.images.map(imageSource)" fit="contain" :alt="image.name || '委派的图片'" @load="scrollToBottom()" /></div>
          <div v-if="message.role === 'user' && message.text" class="agent-user-bubble">{{ message.text }}</div>
          <template v-else>
            <agent-thinking-panel v-if="message.thinking" :text="message.thinking" :streaming="isStreaming(message) && !message.text" @layout="scrollToBottom()" />
            <agent-tool-card v-for="childTool in (message.tools || [])" :key="childTool.id" :tool="childTool" :now="now" @layout="scrollToBottom()" />
            <agent-markdown v-if="message.text" :text="message.text" :streaming="isStreaming(message)" @layout="scrollToBottom()" />
          </template>
          <p v-if="message.error" class="agent-message__error">{{ message.error }}</p>
        </article>
        <p v-if="status === 'running' && !lastAssistant" class="agent-subagent-panel__hint"><i class="el-icon-loading" /> 正在执行委派任务…</p>
        <p v-if="run && run.error" class="agent-message__error">{{ run.error }}</p>
        <p v-if="!run && status !== 'running'" class="agent-subagent-panel__hint">这次调用未记录详细过程。</p>
        <agent-markdown v-if="!run && tool.output" :text="tool.output" @layout="scrollToBottom()" />
      </div>
    </div>
    <button v-if="userPinnedScroll" class="agent-subagent-panel__latest agent-history-button" type="button" @click="scrollToBottom(true)">回到最新</button>
  </aside>
</template>

<script>
import { imageSource } from '@/utils/agent-images'
import chatScroll from '@/utils/agent-chat-scroll'
import AgentMarkdown from './AgentMarkdown.vue'
import AgentThinkingPanel from './AgentThinkingPanel.vue'
import AgentToolCard from './AgentToolCard.vue'

export default {
  name: 'AgentSubagentPanel',
  components: { AgentMarkdown, AgentThinkingPanel, AgentToolCard },
  mixins: [chatScroll],
  props: { tool: { type: Object, required: true }, agents: { type: Array, default: () => [] }, now: Number },
  computed: {
    run() { return this.tool.subagent },
    title() { return (this.run && this.run.name) || (this.tool.input || {}).profile || '子代理' },
    status() { return this.tool.status !== 'running' ? this.tool.status : (this.run && this.run.status) || this.tool.status },
    messages() { return (this.run && this.run.messages) || [] },
    lastAssistant() { return this.messages.slice().reverse().find(message => message.role === 'assistant') }
  },
  watch: {
    'tool.id': { immediate: true, handler() { this.$nextTick(() => this.scrollToBottom(true)) } },
    'tool.subagent'() { this.$nextTick(() => this.scrollToBottom()) }
  },
  methods: { imageSource, isStreaming(message) { return this.status === 'running' && this.lastAssistant && message.id === this.lastAssistant.id } }
}
</script>

<style lang="scss" scoped>
.agent-subagent-panel { line-height: 1.5; font-family: inherit; margin: 0; padding: 0; border-radius: 0; position: relative; display: flex; min-width: 0; min-height: 0; width: 44%; flex: 0 0 44%; flex-direction: column; border-left: 1px solid var(--agent-line); background: var(--agent-background, #ffffff); color: var(--agent-ink); }
.agent-subagent-panel__header { display: flex; min-height: 76px; align-items: center; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--agent-line); > i { color: var(--agent-accent); } > div { min-width: 0; flex: 1; } strong { display: block; overflow: hidden; font-size: 14px; text-overflow: ellipsis; white-space: nowrap; } small { display: block; margin-top: 6px; color: var(--agent-muted); font-size: 11px; } }
.agent-icon-button { padding: 7px; border: 0; border-radius: 7px; background: transparent; color: var(--agent-muted); cursor: pointer; }
.agent-subagent-panel__tabs { display: flex; gap: 7px; padding: 10px 16px; overflow-x: auto; border-bottom: 1px solid var(--agent-line); button { flex-shrink: 0; padding: 7px 10px; border: 1px solid var(--agent-line); border-radius: 7px; background: transparent; color: var(--agent-muted); font-size: 11px; cursor: pointer; &[aria-pressed='true'] { color: var(--agent-accent); border-color: var(--agent-accent); } } }
.agent-subagent-panel__scroll { min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; overflow-anchor: none; }
.agent-subagent-panel__content { padding: 22px; }
.agent-subagent-images { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; .el-image { width: 200px; max-width: 100%; max-height: 240px; border-radius: 10px; } }
.agent-subagent-message { padding: 12px 0; }
.agent-message__author { margin-bottom: 12px; color: var(--agent-muted); font-size: 12px; }
.agent-user-bubble { padding: 12px 16px; border: 1px solid var(--agent-line); border-radius: 12px; background: var(--agent-surface, #eff6ff); color: var(--agent-text, #374151); font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; white-space: pre-wrap; }
.agent-message__error { padding: 12px; border-radius: 8px; background: var(--agent-error-soft, #fef2f2); color: var(--agent-error, #b91c1c); font-size: 12px; overflow-wrap: anywhere; }
.agent-subagent-panel__hint { color: var(--agent-muted); font-size: 12px; }
.agent-subagent-panel__latest { position: absolute; right: 22px; bottom: 16px; padding: 8px 12px; border: 1px solid var(--agent-line); border-radius: 20px; background: var(--agent-background, #ffffff); color: var(--agent-accent); cursor: pointer; }
@media (max-width: 760px) { .agent-subagent-panel { line-height: 1.5; font-family: inherit; margin: 0; padding: 0; border-radius: 0; position: absolute; inset: 0; z-index: 3; width: 100%; border: 0; } .agent-subagent-panel__content { padding: 16px; } }
</style>
