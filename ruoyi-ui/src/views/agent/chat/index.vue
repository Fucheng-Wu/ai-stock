<template>
  <div class="agent-chat-page">
    <div v-if="mobileSidebarOpen" class="agent-sidebar-mask" @click="mobileSidebarOpen = false" />

    <aside class="agent-sidebar" :class="{ 'is-mobile-open': mobileSidebarOpen }">
      <div class="agent-brand">
        <div class="agent-brand__mark">✦</div>
        <div class="agent-brand__copy">
          <strong>Orange Agent</strong>
          <span>PERSONAL ASSISTANT</span>
        </div>
        <button class="agent-icon-button agent-sidebar__close" type="button" aria-label="关闭会话列表" @click="mobileSidebarOpen = false">
          <i class="el-icon-close" />
        </button>
      </div>

      <button class="agent-new-chat" type="button" :disabled="!isConnected" @click="startNewConversation">
        <i class="el-icon-plus" />
        <span>新建对话</span>
        <span class="agent-new-chat__shortcut">⌘ N</span>
      </button>

      <div class="agent-session-section">
        <div class="agent-section-title">
          <span>最近对话</span>
          <span>{{ sessions.length }}</span>
        </div>

        <div class="agent-session-list">
          <div v-if="!sortedSessions.length" class="agent-session-empty">
            <i class="el-icon-chat-dot-round" />
            <span>还没有对话</span>
          </div>

          <div
            v-for="session in sortedSessions"
            :key="session.id"
            class="agent-session-item"
            :class="{ 'is-active': activeSessionId === session.id }"
          >
            <button class="agent-session-item__main" type="button" @click="selectSession(session.id)">
              <i class="el-icon-chat-line-round" />
              <span class="agent-session-item__text">
                <strong>{{ session.title || '新对话' }}</strong>
                <small>{{ formatSessionTime(session.updatedAt) }}</small>
              </span>
            </button>
            <button
              class="agent-session-item__delete"
              type="button"
              title="删除对话"
              aria-label="删除对话"
              @click.stop="confirmDeleteSession(session)"
            >
              <i class="el-icon-delete" />
            </button>
          </div>
        </div>
      </div>

      <div class="agent-sidebar__footer">
        <button class="agent-connection" type="button" @click="reconnectNow">
          <span class="agent-connection__dot" :class="'is-' + connectionState" />
          <span>{{ connectionLabel }}</span>
          <i v-if="!isConnected" class="el-icon-refresh" />
        </button>
        <span class="agent-endpoint">{{ endpointLabel }}</span>
      </div>
    </aside>

    <main class="agent-main">
      <header class="agent-topbar">
        <button class="agent-icon-button agent-topbar__menu" type="button" aria-label="打开会话列表" @click="mobileSidebarOpen = true">
          <i class="el-icon-s-unfold" />
        </button>
        <div class="agent-topbar__title">
          <strong>{{ activeTitle }}</strong>
          <span v-if="activeModel">{{ activeModel }}</span>
          <span v-else>专属 Agent</span>
        </div>
        <div class="agent-topbar__status" :class="{ 'is-online': isConnected }">
          <span />
          {{ isConnected ? '在线' : connectionLabel }}
        </div>
      </header>

      <div v-if="!isConnected" class="agent-connection-banner">
        <i class="el-icon-warning-outline" />
        <span>{{ connectionState === 'reconnecting' ? '与 Agent 的连接已中断，正在自动重连…' : '暂时无法连接 Agent Gateway。' }}</span>
        <button type="button" @click="reconnectNow">重新连接</button>
      </div>

      <section ref="messageScroller" class="agent-conversation" @scroll="handleConversationScroll">
        <div v-if="isSessionLoading" class="agent-session-loading">
          <i class="el-icon-loading" />
          <span>正在载入对话</span>
        </div>

        <div v-else-if="!activeState || !activeState.messages.length" class="agent-welcome">
          <div class="agent-welcome__mark">✦</div>
          <h1>今天想聊点什么？</h1>
          <p>这是你的专属 Agent。可以直接提问、整理思路，或让它帮你完成一项工作。</p>
          <div class="agent-suggestions">
            <button v-for="suggestion in suggestions" :key="suggestion.title" type="button" @click="useSuggestion(suggestion.prompt)">
              <span class="agent-suggestions__icon"><i :class="suggestion.icon" /></span>
              <span>
                <strong>{{ suggestion.title }}</strong>
                <small>{{ suggestion.description }}</small>
              </span>
              <i class="el-icon-right agent-suggestions__arrow" />
            </button>
          </div>
        </div>

        <div v-else class="agent-message-list">
          <article
            v-for="message in activeState.messages"
            :key="message.id"
            class="agent-message"
            :class="'is-' + message.role"
          >
            <div class="agent-message__avatar">
              <span v-if="message.role === 'assistant'">✦</span>
              <i v-else-if="message.role === 'user'" class="el-icon-user-solid" />
              <i v-else class="el-icon-setting" />
            </div>

            <div class="agent-message__body">
              <div v-if="message.role === 'assistant'" class="agent-message__author">
                Orange Agent
                <span v-if="isMessageStreaming(message)" class="agent-typing-dot" />
              </div>

              <div
                v-if="message.thinking"
                class="agent-thinking"
                :class="{ 'is-open': isThinkingOpen(message) }"
              >
                <button type="button" @click="toggleThinking(message)">
                  <i class="el-icon-cpu" />
                  <span>{{ isMessageStreaming(message) && !message.text ? '正在思考' : '思考过程' }}</span>
                  <i :class="isThinkingOpen(message) ? 'el-icon-arrow-up' : 'el-icon-arrow-down'" />
                </button>
                <div v-if="isThinkingOpen(message)" class="agent-thinking__content">{{ message.thinking }}</div>
              </div>

              <div
                v-for="tool in (message.tools || [])"
                :key="tool.id"
                class="agent-tool"
                :class="'is-' + tool.status"
              >
                <button type="button" @click="toggleTool(tool.id)">
                  <span class="agent-tool__status">
                    <i :class="tool.status === 'running' ? 'el-icon-loading' : tool.status === 'error' ? 'el-icon-close' : 'el-icon-check'" />
                  </span>
                  <span class="agent-tool__name">{{ toolLabel(tool.name) }}</span>
                  <span class="agent-tool__state">{{ tool.status === 'running' ? '执行中' : tool.status === 'error' ? '执行失败' : '已完成' }}</span>
                  <i :class="expandedTools[tool.id] ? 'el-icon-arrow-up' : 'el-icon-arrow-down'" />
                </button>
                <div v-if="expandedTools[tool.id]" class="agent-tool__details">
                  <div v-if="tool.input !== undefined">
                    <strong>输入</strong>
                    <pre>{{ formatToolValue(tool.input) }}</pre>
                  </div>
                  <div v-if="tool.output">
                    <strong>输出</strong>
                    <pre>{{ tool.output }}</pre>
                  </div>
                </div>
              </div>

              <div v-if="message.role === 'user'" class="agent-user-bubble">{{ message.text }}</div>
              <agent-markdown
                v-else-if="message.text"
                :text="message.text"
                :streaming="isMessageStreaming(message)"
                @layout="handleRichContentLayout"
              />
              <div v-else-if="isMessageStreaming(message) && !message.thinking && !(message.tools && message.tools.length)" class="agent-typing" aria-label="Agent 正在回复">
                <span /><span /><span />
              </div>

              <div v-if="message.error" class="agent-message__error">
                <i class="el-icon-warning-outline" />{{ message.error }}
              </div>

              <div v-if="message.role === 'assistant' && message.text && !isMessageStreaming(message)" class="agent-message__actions">
                <button type="button" @click="copyMessage(message)">
                  <i :class="copiedMessageId === message.id ? 'el-icon-check' : 'el-icon-copy-document'" />
                  {{ copiedMessageId === message.id ? '已复制' : '复制' }}
                </button>
              </div>
            </div>
          </article>
        </div>
      </section>

      <footer class="agent-composer-area">
        <div class="agent-composer" :class="{ 'is-focused': composerFocused, 'is-disabled': !isConnected }">
          <el-input
            ref="composer"
            v-model="inputText"
            class="agent-composer__input"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 6 }"
            maxlength="12000"
            resize="none"
            :disabled="!isConnected"
            :placeholder="isConnected ? '给 Agent 发送消息…' : '连接成功后即可开始对话'"
            @focus="composerFocused = true"
            @blur="composerFocused = false"
            @keydown.enter.native="handleComposerEnter"
          />
          <button
            v-if="activeState && activeState.isStreaming"
            class="agent-composer__send is-stop"
            type="button"
            title="停止生成"
            aria-label="停止生成"
            @click="abortGeneration"
          >
            <span />
          </button>
          <button
            v-else
            class="agent-composer__send"
            type="button"
            title="发送消息"
            aria-label="发送消息"
            :disabled="!canSubmit"
            @click="submitPrompt"
          >
            <i class="el-icon-top" />
          </button>
        </div>
        <div class="agent-composer__meta">
          <span>Enter 发送 · Shift + Enter 换行</span>
          <span v-if="contextLabel">{{ contextLabel }}</span>
          <span v-else>Agent 的回答可能存在偏差，请核对重要信息</span>
        </div>
      </footer>
    </main>
  </div>
</template>

<script>
import { AGENT_PROTOCOL_VERSION, getAgentWebSocketUrl } from '@/utils/agentSocket'
import { getToken } from '@/utils/auth'
import AgentMarkdown from './components/AgentMarkdown.vue'

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default {
  name: 'AgentChat',
  components: { AgentMarkdown },
  data() {
    return {
      socketClient: null,
      reconnectTimer: null,
      heartbeatTimer: null,
      pongTimer: null,
      reconnectAttempts: 0,
      componentDestroyed: false,
      connectionState: 'connecting',
      sessions: [],
      sessionStates: {},
      loadingSessionIds: {},
      activeSessionId: null,
      inputText: '',
      pendingPrompt: '',
      creatingSession: false,
      composerFocused: false,
      mobileSidebarOpen: false,
      copiedMessageId: '',
      expandedThinking: {},
      expandedTools: {},
      userPinnedScroll: false,
      endpointLabel: '/agent-ws',
      suggestions: [
        { title: '帮我理清思路', description: '把一个复杂问题拆成清晰步骤', prompt: '帮我梳理一下现在最值得优先处理的事情，并给出清晰的行动步骤。', icon: 'el-icon-guide' },
        { title: '分析一段内容', description: '提炼重点、风险与下一步', prompt: '我接下来会发一段内容，请帮我提炼重点、潜在风险和下一步行动。', icon: 'el-icon-document' },
        { title: '完成一项任务', description: '告诉 Agent 目标和约束', prompt: '我有一项任务想请你协助完成。请先帮我明确目标、约束和交付结果。', icon: 'el-icon-magic-stick' },
        { title: '一起探索想法', description: '从模糊灵感开始讨论', prompt: '我有一个还不成熟的想法，想和你一起探索它的可能性。', icon: 'el-icon-s-opportunity' }
      ]
    }
  },
  computed: {
    isConnected() {
      return this.connectionState === 'connected'
    },
    sortedSessions() {
      return [...this.sessions].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    },
    activeState() {
      return this.activeSessionId ? this.sessionStates[this.activeSessionId] : null
    },
    activeTitle() {
      if (!this.activeState || !this.activeState.summary) return '新对话'
      return this.activeState.summary.title || '新对话'
    },
    activeModel() {
      if (!this.activeState || !this.activeState.model) return ''
      return this.activeState.model.id || this.activeState.model.provider || ''
    },
    connectionLabel() {
      const labels = {
        connected: '已连接',
        connecting: '连接中…',
        reconnecting: '正在重连…',
        disconnected: '未连接'
      }
      return labels[this.connectionState] || '未连接'
    },
    canSubmit() {
      if (!this.isConnected || this.creatingSession || !this.inputText.trim()) return false
      if (this.activeSessionId && !this.activeState) return false
      return !(this.activeState && this.activeState.isStreaming)
    },
    isSessionLoading() {
      return Boolean(this.activeSessionId && !this.activeState && this.loadingSessionIds[this.activeSessionId])
    },
    contextLabel() {
      const usage = this.activeState && this.activeState.contextUsage
      if (!usage || usage.percent === undefined) return ''
      return `上下文已用 ${Math.round(usage.percent)}%`
    }
  },
  mounted() {
    this.endpointLabel = process.env.VUE_APP_AGENT_WS_URL || '/agent-ws'
    window.addEventListener('keydown', this.handleGlobalShortcut)
    this.connectSocket()
  },
  beforeDestroy() {
    this.componentDestroyed = true
    window.removeEventListener('keydown', this.handleGlobalShortcut)
    this.clearSocketTimers()
    if (this.socketClient) {
      this.socketClient.onclose = null
      this.socketClient.close(1000, 'Page closed')
      this.socketClient = null
    }
  },
  methods: {
    connectSocket() {
      if (this.componentDestroyed || !window.WebSocket) {
        this.connectionState = 'disconnected'
        return
      }
      if (this.socketClient && (this.socketClient.readyState === WebSocket.OPEN || this.socketClient.readyState === WebSocket.CONNECTING)) return

      this.connectionState = this.reconnectAttempts ? 'reconnecting' : 'connecting'
      let socket
      try {
        socket = new WebSocket(getAgentWebSocketUrl())
      } catch (error) {
        this.connectionState = 'disconnected'
        this.$message.error('Agent WebSocket 地址无效，请检查环境配置')
        return
      }
      this.socketClient = socket

      socket.onopen = () => {
        if (this.socketClient !== socket) return
        this.reconnectAttempts = 0
        this.connectionState = 'connected'
        this.startHeartbeat()
        this.sendSocket({ type: 'init', protocolVersion: AGENT_PROTOCOL_VERSION, requestId: createId('init') })
      }

      socket.onmessage = event => {
        let message
        try {
          message = JSON.parse(String(event.data))
        } catch (error) {
          return
        }
        if (!message || typeof message.type !== 'string') return
        if (message.type === 'pong') {
          if (this.pongTimer) clearTimeout(this.pongTimer)
          this.pongTimer = null
          return
        }
        this.handleServerMessage(message)
      }

      socket.onerror = () => socket.close()
      socket.onclose = () => {
        if (this.socketClient !== socket) return
        this.socketClient = null
        this.stopHeartbeat()
        if (this.componentDestroyed) return
        this.connectionState = 'reconnecting'
        const delay = Math.min(15000, 800 * Math.pow(2, Math.min(this.reconnectAttempts++, 5))) + Math.random() * 350
        this.reconnectTimer = setTimeout(() => this.connectSocket(), delay)
      }
    },
    reconnectNow() {
      if (this.isConnected) return
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
      if (this.socketClient) {
        this.socketClient.onclose = null
        this.socketClient.close()
        this.socketClient = null
      }
      this.reconnectAttempts = 0
      this.connectSocket()
    },
    clearSocketTimers() {
      if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
      this.stopHeartbeat()
      this.reconnectTimer = null
    },
    startHeartbeat() {
      this.stopHeartbeat()
      this.heartbeatTimer = setInterval(() => {
        if (!this.sendSocket({ type: 'ping' }, false)) return
        if (this.pongTimer) clearTimeout(this.pongTimer)
        this.pongTimer = setTimeout(() => {
          if (this.socketClient) this.socketClient.close()
        }, 10000)
      }, 25000)
    },
    stopHeartbeat() {
      if (this.heartbeatTimer) clearInterval(this.heartbeatTimer)
      if (this.pongTimer) clearTimeout(this.pongTimer)
      this.heartbeatTimer = null
      this.pongTimer = null
    },
    sendSocket(message, notify = true) {
      if (!this.socketClient || this.socketClient.readyState !== WebSocket.OPEN) {
        if (notify) this.$message.warning('Agent 尚未连接，请稍后重试')
        return false
      }
      this.socketClient.send(JSON.stringify(message))
      return true
    },
    handleServerMessage(message) {
      switch (message.type) {
        case 'init':
          this.sessions = Array.isArray(message.sessions) ? message.sessions : []
          if (this.activeSessionId && this.sessions.some(item => item.id === this.activeSessionId)) {
            this.loadSession(this.activeSessionId)
          } else if (this.sortedSessions.length) {
            this.selectSession(this.sortedSessions[0].id)
          } else {
            this.activeSessionId = null
          }
          break
        case 'sessions':
          this.sessions = Array.isArray(message.sessions) ? message.sessions : []
          break
        case 'session_created':
          this.creatingSession = false
          this.installSnapshot(message.session)
          this.activeSessionId = message.session.summary.id
          if (this.pendingPrompt) {
            const prompt = this.pendingPrompt
            this.pendingPrompt = ''
            this.$nextTick(() => this.sendPromptToActive(prompt))
          }
          break
        case 'session_state':
          this.installSnapshot(message.session)
          break
        case 'session_deleted':
          this.removeSessionLocally(message.sessionId)
          break
        case 'agent_start':
        case 'text_delta':
        case 'thinking_delta':
        case 'tool_start':
        case 'tool_update':
        case 'tool_end':
        case 'message_end':
        case 'agent_end':
        case 'session_updated':
          this.applyAgentEvent(message)
          break
        case 'error':
          this.creatingSession = false
          if (this.pendingPrompt) {
            this.inputText = this.pendingPrompt
            this.pendingPrompt = ''
          }
          this.$message.error(message.message || 'Agent 请求失败')
          break
        default:
          break
      }
    },
    normalizeMessage(message) {
      return {
        id: message.id || createId('message'),
        role: message.role || 'assistant',
        text: message.text || '',
        thinking: message.thinking || '',
        tools: Array.isArray(message.tools) ? message.tools.map(tool => ({ ...tool })) : [],
        timestamp: message.timestamp || '',
        error: message.error || ''
      }
    },
    installSnapshot(snapshot) {
      if (!snapshot || !snapshot.summary) return
      const messages = Array.isArray(snapshot.messages) ? snapshot.messages.map(this.normalizeMessage) : []
      let streamMessageId = ''
      const lastMessage = messages[messages.length - 1]
      if (snapshot.isStreaming && lastMessage && lastMessage.role === 'assistant') {
        streamMessageId = lastMessage.id
      }
      const state = {
        summary: { ...snapshot.summary },
        messages,
        model: snapshot.model || null,
        thinkingLevel: snapshot.thinkingLevel || 'medium',
        isStreaming: Boolean(snapshot.isStreaming),
        streamMessageId,
        contextUsage: snapshot.contextUsage || null
      }
      this.$set(this.sessionStates, snapshot.summary.id, state)
      this.$delete(this.loadingSessionIds, snapshot.summary.id)
      this.upsertSessionSummary(snapshot.summary)
      this.$nextTick(() => this.scrollToBottom(true))
    },
    upsertSessionSummary(summary) {
      const index = this.sessions.findIndex(item => item.id === summary.id)
      if (index >= 0) this.$set(this.sessions, index, { ...this.sessions[index], ...summary })
      else this.sessions.push({ ...summary })
    },
    applyAgentEvent(event) {
      if (event.type === 'session_updated' && event.summary) this.upsertSessionSummary(event.summary)
      const state = this.sessionStates[event.sessionId]
      if (!state) {
        if (!this.loadingSessionIds[event.sessionId]) this.loadSession(event.sessionId)
        return
      }

      const shouldStick = event.sessionId === this.activeSessionId && this.isNearBottom()
      switch (event.type) {
        case 'agent_start':
          state.isStreaming = true
          break
        case 'text_delta': {
          state.isStreaming = true
          const assistant = this.ensureAssistantMessage(state)
          assistant.text += event.delta || ''
          break
        }
        case 'thinking_delta': {
          state.isStreaming = true
          const assistant = this.ensureAssistantMessage(state)
          assistant.thinking += event.delta || ''
          break
        }
        case 'tool_start': {
          state.isStreaming = true
          const assistant = this.ensureAssistantMessage(state)
          this.upsertTool(assistant, event.tool)
          break
        }
        case 'tool_update':
        case 'tool_end': {
          // 工具结果应回写原调用者，不能因没有 streamMessageId 就新建回复。
          const owner = state.messages.slice().reverse().find(item => item.tools.some(tool => tool.id === event.toolCallId))
          const tool = owner && owner.tools.find(item => item.id === event.toolCallId)
          if (tool) {
            if (event.output !== undefined) this.$set(tool, 'output', event.output)
            if (event.type === 'tool_end') this.$set(tool, 'status', event.isError ? 'error' : 'done')
          }
          break
        }
        case 'message_end':
          this.finishMessage(state, event.message)
          break
        case 'agent_end':
          state.isStreaming = false
          state.streamMessageId = ''
          if (event.contextUsage) state.contextUsage = event.contextUsage
          if (event.error) {
            const assistant = this.findLastAssistant(state.messages)
            if (assistant) this.$set(assistant, 'error', event.error)
            else state.messages.push(this.normalizeMessage({ role: 'assistant', error: event.error }))
          }
          break
        case 'session_updated':
          if (event.summary) state.summary = { ...event.summary }
          if (event.model) state.model = event.model
          if (event.thinkingLevel) state.thinkingLevel = event.thinkingLevel
          if (event.contextUsage) state.contextUsage = event.contextUsage
          break
        default:
          break
      }

      if (shouldStick || event.type === 'agent_start') this.$nextTick(() => this.scrollToBottom(true))
    },
    ensureAssistantMessage(state) {
      let message = state.streamMessageId ? state.messages.find(item => item.id === state.streamMessageId) : null
      if (!message) {
        message = this.normalizeMessage({ id: createId('stream'), role: 'assistant' })
        state.messages.push(message)
        state.streamMessageId = message.id
      }
      return message
    },
    upsertTool(message, incoming) {
      if (!incoming) return
      const index = message.tools.findIndex(item => item.id === incoming.id)
      const tool = { status: 'running', ...incoming }
      if (index >= 0) this.$set(message.tools, index, { ...message.tools[index], ...tool })
      else message.tools.push(tool)
    },
    finishMessage(state, incoming) {
      if (!incoming) return
      const normalized = this.normalizeMessage(incoming)
      if (normalized.role === 'user') {
        const optimisticIndex = state.messages.findIndex(item => item.role === 'user' && String(item.id).startsWith('optimistic-') && item.text === normalized.text)
        if (optimisticIndex >= 0) {
          this.$set(state.messages, optimisticIndex, normalized)
          return
        }
      }
      if (normalized.role === 'assistant' && state.streamMessageId) {
        const streamIndex = state.messages.findIndex(item => item.id === state.streamMessageId)
        if (streamIndex >= 0) {
          this.$set(state.messages, streamIndex, normalized)
          // message_end 仅结束一次模型输出；工具调用后的输出仍属于本轮回复。
          // 与原版网关一致，直到 agent_end 才释放这条气泡。
          state.streamMessageId = normalized.id
          return
        }
      }
      const existingIndex = state.messages.findIndex(item => item.id === normalized.id)
      if (existingIndex >= 0) this.$set(state.messages, existingIndex, normalized)
      else state.messages.push(normalized)
      if (normalized.role === 'assistant' && state.isStreaming) state.streamMessageId = normalized.id
    },
    findLastAssistant(messages) {
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index].role === 'assistant') return messages[index]
      }
      return null
    },
    startNewConversation() {
      this.activeSessionId = null
      this.pendingPrompt = ''
      this.mobileSidebarOpen = false
      this.$nextTick(() => this.focusComposer())
    },
    selectSession(sessionId) {
      this.activeSessionId = sessionId
      this.mobileSidebarOpen = false
      this.loadSession(sessionId)
      this.$nextTick(() => this.scrollToBottom(true))
    },
    loadSession(sessionId) {
      if (!sessionId || this.loadingSessionIds[sessionId]) return
      this.$set(this.loadingSessionIds, sessionId, true)
      if (!this.sendSocket({ type: 'load_session', sessionId, requestId: createId('load') })) {
        this.$delete(this.loadingSessionIds, sessionId)
      }
    },
    submitPrompt() {
      const prompt = this.inputText.trim()
      if (!prompt || !this.canSubmit) return
      if (!this.activeSessionId) {
        this.pendingPrompt = prompt
        this.inputText = ''
        this.creatingSession = true
        if (!this.sendSocket({ type: 'create_session', requestId: createId('create') })) {
          this.creatingSession = false
          this.inputText = this.pendingPrompt
          this.pendingPrompt = ''
        }
        return
      }
      this.sendPromptToActive(prompt)
    },
    sendPromptToActive(prompt) {
      const state = this.activeState
      if (!state || state.isStreaming) return
      if (!this.sendSocket({ type: 'prompt', sessionId: this.activeSessionId, text: prompt, stockAccessToken: getToken(), requestId: createId('prompt') })) return
      state.messages.push(this.normalizeMessage({
        id: createId('optimistic'),
        role: 'user',
        text: prompt,
        timestamp: new Date().toISOString()
      }))
      state.isStreaming = true
      if (!state.summary.title) state.summary.title = prompt.slice(0, 48)
      this.inputText = ''
      this.userPinnedScroll = false
      this.$nextTick(() => this.scrollToBottom(true))
    },
    abortGeneration() {
      if (!this.activeSessionId) return
      this.sendSocket({ type: 'abort', sessionId: this.activeSessionId, requestId: createId('abort') })
    },
    handleComposerEnter(event) {
      if (event.isComposing || event.shiftKey) return
      event.preventDefault()
      this.submitPrompt()
    },
    handleGlobalShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'n') {
        event.preventDefault()
        this.startNewConversation()
      }
    },
    useSuggestion(prompt) {
      this.inputText = prompt
      this.$nextTick(() => this.focusComposer())
    },
    focusComposer() {
      if (this.$refs.composer && this.$refs.composer.focus) this.$refs.composer.focus()
    },
    confirmDeleteSession(session) {
      this.$confirm(`删除对话“${session.title || '新对话'}”？删除后无法恢复。`, '删除对话', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        this.sendSocket({ type: 'delete_session', sessionId: session.id, requestId: createId('delete') })
      }).catch(() => {})
    },
    removeSessionLocally(sessionId) {
      this.sessions = this.sessions.filter(item => item.id !== sessionId)
      this.$delete(this.sessionStates, sessionId)
      this.$delete(this.loadingSessionIds, sessionId)
      if (this.activeSessionId === sessionId) {
        this.activeSessionId = null
        if (this.sortedSessions.length) this.selectSession(this.sortedSessions[0].id)
      }
    },
    isMessageStreaming(message) {
      return Boolean(this.activeState && this.activeState.isStreaming && this.activeState.streamMessageId === message.id)
    },
    isThinkingOpen(message) {
      return Boolean(this.expandedThinking[message.id] || (this.isMessageStreaming(message) && !message.text))
    },
    toggleThinking(message) {
      this.$set(this.expandedThinking, message.id, !this.isThinkingOpen(message))
    },
    toggleTool(toolId) {
      this.$set(this.expandedTools, toolId, !this.expandedTools[toolId])
    },
    toolLabel(name) {
      const labels = {
        read: '读取文件', write: '写入文件', edit: '编辑文件', bash: '运行命令',
        grep: '搜索内容', find: '查找文件', ls: '浏览目录', web_search: '搜索网络',
        web_fetch: '读取网页', subagent: '调用子 Agent'
      }
      return labels[name] || name || '调用工具'
    },
    formatToolValue(value) {
      if (typeof value === 'string') return value
      try {
        return JSON.stringify(value, null, 2)
      } catch (error) {
        return String(value)
      }
    },
    handleRichContentLayout() {
      this.$nextTick(() => this.scrollToBottom())
    },
    copyMessage(message) {
      const text = message.text || ''
      const markCopied = () => {
        this.copiedMessageId = message.id
        setTimeout(() => {
          if (this.copiedMessageId === message.id) this.copiedMessageId = ''
        }, 1500)
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(markCopied).catch(() => this.copyWithFallback(text, markCopied))
      } else {
        this.copyWithFallback(text, markCopied)
      }
    },
    copyWithFallback(text, callback) {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        document.execCommand('copy')
        callback()
      } catch (error) {
        this.$message.warning('复制失败，请手动选择文本')
      }
      document.body.removeChild(textarea)
    },
    formatSessionTime(value) {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      const today = new Date()
      if (date.toDateString() === today.toDateString()) {
        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      }
      return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
    },
    handleConversationScroll() {
      this.userPinnedScroll = !this.isNearBottom()
    },
    isNearBottom() {
      const element = this.$refs.messageScroller
      if (!element) return true
      return element.scrollHeight - element.scrollTop - element.clientHeight < 140
    },
    scrollToBottom(force = false) {
      const element = this.$refs.messageScroller
      if (!element || (!force && this.userPinnedScroll)) return
      element.scrollTop = element.scrollHeight
      this.userPinnedScroll = false
    }
  }
}
</script>

<style lang="scss" scoped>
.agent-chat-page {
  --agent-accent: #f07b3f;
  --agent-accent-dark: #d85d25;
  --agent-ink: #202123;
  --agent-muted: #6f737a;
  --agent-line: #e7e7e5;
  display: flex;
  width: 100%;
  height: calc(100vh - 84px);
  min-height: 560px;
  overflow: hidden;
  background: #fff;
  color: var(--agent-ink);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;

  * {
    box-sizing: border-box;
  }

  button {
    font-family: inherit;
  }
}

.agent-sidebar {
  position: relative;
  z-index: 4;
  display: flex;
  flex: 0 0 272px;
  flex-direction: column;
  width: 272px;
  min-width: 0;
  border-right: 1px solid #e8e8e6;
  background: #f7f7f5;
}

.agent-brand {
  display: flex;
  align-items: center;
  gap: 11px;
  height: 68px;
  padding: 0 18px;
}

.agent-brand__mark,
.agent-welcome__mark {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(145deg, #ffad68, var(--agent-accent) 58%, #d95725);
  box-shadow: 0 7px 18px rgba(221, 93, 36, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.45);
}

.agent-brand__mark {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  font-size: 18px;
}

.agent-brand__copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.agent-brand__copy strong {
  overflow: hidden;
  color: #252525;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.01em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-brand__copy span {
  margin-top: 2px;
  color: #a0a09b;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.agent-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 9px;
  outline: none;
  background: transparent;
  color: #6f737a;
  cursor: pointer;

  &:hover {
    background: #f1f1ef;
    color: #222;
  }
}

.agent-sidebar__close,
.agent-topbar__menu {
  display: none;
  width: 34px;
  height: 34px;
}

.agent-new-chat {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 8px 12px 16px;
  padding: 11px 12px;
  border: 1px solid #dfdfdc;
  border-radius: 11px;
  outline: none;
  background: rgba(255, 255, 255, 0.72);
  color: #333;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;

  &:hover:not(:disabled) {
    border-color: #d0d0cc;
    background: #fff;
    box-shadow: 0 4px 15px rgba(31, 31, 28, 0.06);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

.agent-new-chat__shortcut {
  margin-left: auto;
  color: #aaa9a4;
  font-size: 10px;
  font-weight: 500;
}

.agent-session-section {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  padding: 0 9px;
}

.agent-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px 7px;
  color: #aaa9a4;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.agent-session-list {
  min-height: 0;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
}

.agent-session-empty {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 9px;
  padding: 38px 10px;
  color: #b0afaa;
  font-size: 12px;

  i {
    font-size: 23px;
  }
}

.agent-session-item {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 2px;
  border-radius: 10px;
  transition: background 0.16s;

  &:hover {
    background: #eeeeeb;
  }

  &.is-active {
    background: #e9e9e5;
  }
}

.agent-session-item__main {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 34px 10px 10px;
  border: 0;
  outline: none;
  background: transparent;
  color: #777772;
  text-align: left;
  cursor: pointer;

  > i {
    flex: 0 0 auto;
    margin-top: 2px;
    font-size: 14px;
  }
}

.agent-session-item.is-active .agent-session-item__main > i {
  color: var(--agent-accent-dark);
}

.agent-session-item__text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;

  strong {
    overflow: hidden;
    color: #494946;
    font-size: 12px;
    font-weight: 550;
    line-height: 17px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  small {
    color: #aaa9a4;
    font-size: 10px;
  }
}

.agent-session-item.is-active .agent-session-item__text strong {
  color: #242422;
  font-weight: 650;
}

.agent-session-item__delete {
  position: absolute;
  top: 50%;
  right: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 7px;
  outline: none;
  background: transparent;
  color: #aaa9a4;
  cursor: pointer;
  opacity: 0;
  transform: translateY(-50%);

  &:hover {
    background: rgba(222, 58, 58, 0.08);
    color: #d84d4d;
  }
}

.agent-session-item:hover .agent-session-item__delete,
.agent-session-item:focus-within .agent-session-item__delete {
  opacity: 1;
}

.agent-sidebar__footer {
  padding: 12px 14px 14px;
  border-top: 1px solid #e6e6e2;
}

.agent-connection {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 4px 2px;
  border: 0;
  outline: none;
  background: transparent;
  color: #767670;
  font-size: 11px;
  text-align: left;
  cursor: pointer;

  i {
    margin-left: auto;
  }
}

.agent-connection__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #bbb;

  &.is-connected {
    background: #34b774;
    box-shadow: 0 0 0 3px rgba(52, 183, 116, 0.12);
  }

  &.is-connecting,
  &.is-reconnecting {
    background: #f0a24a;
    animation: agent-pulse 1.3s infinite;
  }
}

.agent-endpoint {
  display: block;
  overflow: hidden;
  margin: 5px 0 0 17px;
  color: #b5b4af;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-main {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  background:
    radial-gradient(circle at 74% 8%, rgba(255, 225, 204, 0.2), transparent 24%),
    #fff;
}

.agent-topbar {
  position: relative;
  z-index: 2;
  display: flex;
  flex: 0 0 60px;
  align-items: center;
  gap: 12px;
  height: 60px;
  padding: 0 24px;
  border-bottom: 1px solid rgba(231, 231, 229, 0.9);
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.agent-topbar__title {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;

  strong {
    overflow: hidden;
    color: #292929;
    font-size: 13px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    margin-top: 2px;
    overflow: hidden;
    color: #9a9a95;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.agent-topbar__status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border: 1px solid #e8e8e5;
  border-radius: 999px;
  color: #969691;
  font-size: 10px;

  > span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #bbb;
  }

  &.is-online > span {
    background: #34b774;
  }
}

.agent-connection-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 36px;
  padding: 7px 16px;
  border-bottom: 1px solid #f2dfc5;
  background: #fff8ee;
  color: #946425;
  font-size: 11px;

  button {
    padding: 0;
    border: 0;
    border-bottom: 1px solid currentColor;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
}

.agent-conversation {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.agent-session-loading {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #989893;
  font-size: 12px;
}

.agent-welcome {
  display: flex;
  width: min(680px, calc(100% - 40px));
  min-height: 100%;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  margin: 0 auto;
  padding: 48px 0 36px;
  text-align: center;
}

.agent-welcome__mark {
  width: 50px;
  height: 50px;
  margin-bottom: 22px;
  border-radius: 17px;
  font-size: 25px;
}

.agent-welcome h1 {
  margin: 0;
  color: #242424;
  font-size: 27px;
  font-weight: 680;
  letter-spacing: -0.035em;
}

.agent-welcome > p {
  max-width: 520px;
  margin: 10px auto 28px;
  color: #858580;
  font-size: 13px;
  line-height: 1.7;
}

.agent-suggestions {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  button {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 11px;
    padding: 14px;
    border: 1px solid #e8e8e5;
    border-radius: 14px;
    outline: none;
    background: rgba(250, 250, 248, 0.76);
    text-align: left;
    cursor: pointer;
    transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s, background 0.18s;

    &:hover {
      border-color: #dadad6;
      background: #fff;
      box-shadow: 0 9px 28px rgba(35, 35, 30, 0.07);
      transform: translateY(-1px);
    }

    > span:nth-child(2) {
      display: flex;
      min-width: 0;
      flex: 1;
      flex-direction: column;
      gap: 3px;
    }

    strong {
      color: #3e3e3b;
      font-size: 12px;
      font-weight: 650;
    }

    small {
      overflow: hidden;
      color: #9a9a95;
      font-size: 10px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}

.agent-suggestions__icon {
  display: flex;
  flex: 0 0 34px;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: #fff1e7;
  color: var(--agent-accent-dark);
  font-size: 15px;
}

.agent-suggestions__arrow {
  color: #c3c2bd;
  font-size: 11px;
}

.agent-message-list {
  width: min(780px, calc(100% - 48px));
  margin: 0 auto;
  padding: 22px 0 40px;
}

.agent-message {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  padding: 14px 0;

  &.is-user {
    justify-content: flex-end;
  }
}

.agent-message__avatar {
  display: flex;
  flex: 0 0 30px;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  margin-top: 1px;
  border: 1px solid #e6e6e3;
  border-radius: 10px;
  background: #fafaf8;
  color: #777;
  font-size: 13px;
}

.agent-message.is-assistant .agent-message__avatar {
  border-color: #f5d4bf;
  background: #fff2e9;
  color: var(--agent-accent-dark);
  font-size: 15px;
}

.agent-message.is-user .agent-message__avatar {
  order: 2;
  border: 0;
  background: #e9e9e6;
  color: #686864;
}

.agent-message__body {
  min-width: 0;
  max-width: calc(100% - 44px);
  flex: 1;
}

.agent-message.is-user .agent-message__body {
  display: flex;
  max-width: min(76%, 620px);
  flex: 0 1 auto;
  align-items: flex-end;
  flex-direction: column;
}

.agent-message__author {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 7px;
  color: #454542;
  font-size: 11px;
  font-weight: 700;
}

.agent-typing-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--agent-accent);
  animation: agent-pulse 1.2s ease-in-out infinite;
}

.agent-user-bubble {
  padding: 10px 14px;
  border-radius: 16px 16px 4px 16px;
  background: #30302e;
  box-shadow: 0 4px 12px rgba(25, 25, 24, 0.08);
  color: #fff;
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.agent-thinking {
  width: 100%;
  margin: 0 0 9px;
  border-left: 2px solid #e5e0da;

  > button {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 5px 10px;
    border: 0;
    outline: none;
    background: transparent;
    color: #98938d;
    font-size: 11px;
    cursor: pointer;

    i:last-child {
      font-size: 9px;
    }
  }
}

.agent-thinking__content {
  max-height: 260px;
  overflow: auto;
  padding: 4px 12px 9px;
  color: #8a857f;
  font-size: 11px;
  line-height: 1.65;
  white-space: pre-wrap;
}

.agent-tool {
  width: min(100%, 620px);
  margin: 7px 0;
  overflow: hidden;
  border: 1px solid #e9e8e4;
  border-radius: 10px;
  background: #fafaf8;

  > button {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 0;
    outline: none;
    background: transparent;
    color: #5f5f5a;
    font-size: 11px;
    text-align: left;
    cursor: pointer;

    > i:last-child {
      color: #aaa;
      font-size: 9px;
    }
  }
}

.agent-tool__status {
  display: flex;
  width: 19px;
  height: 19px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: #eaf5ee;
  color: #36a36c;
  font-size: 10px;
}

.agent-tool.is-running .agent-tool__status {
  background: #fff0e5;
  color: var(--agent-accent-dark);
}

.agent-tool.is-error .agent-tool__status {
  background: #fdeaea;
  color: #d95050;
}

.agent-tool__name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-tool__state {
  color: #a3a29d;
  font-size: 10px;
}

.agent-tool__details {
  padding: 0 10px 10px 37px;

  > div + div {
    margin-top: 8px;
  }

  strong {
    color: #91908b;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  pre {
    max-height: 220px;
    margin: 5px 0 0;
    overflow: auto;
    padding: 9px;
    border-radius: 7px;
    background: #f0f0ed;
    color: #555550;
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 10px;
    line-height: 1.55;
    white-space: pre-wrap;
  }
}

.agent-message__error {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: 9px;
  padding: 9px 11px;
  border: 1px solid #f1caca;
  border-radius: 9px;
  background: #fff3f3;
  color: #bb4848;
  font-size: 11px;
  line-height: 1.5;
}

.agent-message__actions {
  height: 24px;
  margin-top: 5px;
  opacity: 0;
  transition: opacity 0.15s;

  button {
    padding: 3px 5px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: #9c9b96;
    font-size: 10px;
    cursor: pointer;

    &:hover {
      background: #f4f4f1;
      color: #555;
    }
  }
}

.agent-message:hover .agent-message__actions,
.agent-message:focus-within .agent-message__actions {
  opacity: 1;
}

.agent-typing {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 25px;

  span {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #9e9b96;
    animation: agent-typing 1.2s infinite ease-in-out;

    &:nth-child(2) { animation-delay: 0.14s; }
    &:nth-child(3) { animation-delay: 0.28s; }
  }
}

.agent-composer-area {
  position: relative;
  z-index: 2;
  flex: 0 0 auto;
  padding: 8px max(22px, calc((100% - 780px) / 2)) 13px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), #fff 22%, #fff 100%);
}

.agent-composer {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 10px;
  padding: 10px 10px 10px 15px;
  border: 1px solid #dededb;
  border-radius: 17px;
  background: #fff;
  box-shadow: 0 7px 25px rgba(31, 31, 28, 0.08), 0 1px 2px rgba(31, 31, 28, 0.03);
  transition: border-color 0.18s, box-shadow 0.18s;

  &.is-focused {
    border-color: #cac9c5;
    box-shadow: 0 8px 28px rgba(31, 31, 28, 0.1), 0 0 0 3px rgba(240, 123, 63, 0.07);
  }

  &.is-disabled {
    background: #fafaf8;
    box-shadow: none;
  }
}

.agent-composer__input {
  min-width: 0;
  flex: 1;

  ::v-deep .el-textarea__inner {
    min-height: 27px !important;
    padding: 3px 0 2px;
    border: 0;
    outline: none;
    background: transparent;
    box-shadow: none;
    color: #2c2c2a;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.6;

    &::placeholder {
      color: #aaa9a5;
    }
  }
}

.agent-composer__send {
  display: flex;
  flex: 0 0 34px;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 11px;
  outline: none;
  background: #30302e;
  color: #fff;
  cursor: pointer;
  transition: background 0.16s, transform 0.16s, opacity 0.16s;

  &:hover:not(:disabled) {
    background: #181817;
    transform: translateY(-1px);
  }

  &:disabled {
    background: #e4e4e1;
    color: #aaa9a5;
    cursor: not-allowed;
  }

  &.is-stop {
    background: #3d3d3a;
  }

  &.is-stop span {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: #fff;
  }
}

.agent-composer__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 3px 0;
  color: #aaa9a5;
  font-size: 9px;
}

.agent-sidebar-mask {
  display: none;
}

@keyframes agent-typing {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}

@keyframes agent-pulse {
  0%, 100% { opacity: 0.45; }
  50% { opacity: 1; }
}

@media (hover: none) {
  .agent-session-item__delete,
  .agent-message__actions {
    opacity: 1;
  }
}

@media (max-width: 900px) {
  .agent-chat-page {
    height: calc(100vh - 84px);
    height: calc(100dvh - 84px);
    min-height: 480px;
  }

  .agent-sidebar {
    position: absolute;
    inset: 0 auto 0 0;
    width: min(292px, 84vw);
    transform: translateX(-102%);
    transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);

    &.is-mobile-open {
      transform: translateX(0);
      box-shadow: 16px 0 40px rgba(20, 20, 18, 0.18);
    }
  }

  .agent-sidebar-mask {
    position: absolute;
    inset: 0;
    z-index: 3;
    display: block;
    background: rgba(20, 20, 18, 0.32);
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }

  .agent-sidebar__close,
  .agent-topbar__menu {
    display: inline-flex;
  }

  .agent-topbar {
    padding: 0 15px;
  }

  .agent-message-list {
    width: calc(100% - 28px);
  }

  .agent-composer-area {
    padding-right: 14px;
    padding-left: 14px;
  }
}

@media (max-width: 600px) {
  .agent-welcome {
    width: calc(100% - 28px);
    justify-content: flex-start;
    padding-top: 54px;
  }

  .agent-welcome h1 {
    font-size: 24px;
  }

  .agent-welcome > p {
    margin-bottom: 22px;
  }

  .agent-suggestions {
    grid-template-columns: 1fr;
  }

  .agent-suggestions button:nth-child(n + 4) {
    display: none;
  }

  .agent-message-list {
    padding-top: 12px;
  }

  .agent-message {
    gap: 9px;
  }

  .agent-message__avatar {
    flex-basis: 27px;
    width: 27px;
    height: 27px;
    border-radius: 9px;
  }

  .agent-message__body {
    max-width: calc(100% - 36px);
  }

  .agent-message.is-user .agent-message__body {
    max-width: 84%;
  }

  .agent-composer__meta span:first-child {
    display: none;
  }

  .agent-composer__meta {
    justify-content: center;
    text-align: center;
  }

  .agent-topbar__status {
    padding: 5px 7px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .agent-typing span,
  .agent-typing-dot,
  .agent-connection__dot {
    animation: none !important;
  }
}
</style>
