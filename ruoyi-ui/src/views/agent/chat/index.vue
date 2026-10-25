<template>
  <div class="agent-chat-page">
    <div v-if="mobileSidebarOpen" class="agent-sidebar-mask" @click="mobileSidebarOpen = false" />

    <aside class="agent-sidebar" :class="{ 'is-mobile-open': mobileSidebarOpen }">
      <div class="agent-brand">
        <div class="agent-brand__mark">✦</div>
        <div class="agent-brand__copy">
          <strong>Orange Agent</strong>
          <span>让每一次探索，都更进一步</span>
        </div>
        <button class="agent-icon-button agent-sidebar__close" type="button" aria-label="关闭会话列表" @click="mobileSidebarOpen = false">
          <i class="el-icon-close" />
        </button>
      </div>

      <button class="agent-new-chat" type="button" :disabled="!isConnected || creatingSession" @click="startNewConversation">
        <i class="el-icon-plus" />
        <span>新建对话</span>
        <span class="agent-new-chat__shortcut">{{ shortcutLabel }}</span>
      </button>

      <el-input v-model="sessionQuery" class="agent-session-search" placeholder="搜索对话标题" prefix-icon="el-icon-search" size="small" :maxlength="100" clearable @input="scheduleSessionSearch" />
      <div class="agent-session-section">
        <div class="agent-section-title">
          <span>最近对话</span>
          <span>已加载 {{ sortedSessions.length }}</span>
        </div>

        <div class="agent-session-list">
          <div v-if="!sortedSessions.length" class="agent-session-empty">
            <i class="el-icon-chat-dot-round" />
            <span>{{ sessionsLoading ? '正在搜索…' : sessionQuery ? '没有匹配的对话' : '还没有对话' }}</span>
          </div>

          <div v-for="group in sessionGroups" :key="group.label" class="agent-session-group">
          <div class="agent-session-group__title">{{ group.label }}</div>
          <div
            v-for="session in group.sessions"
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
            <div class="agent-session-item__actions">
            <button class="agent-session-action" type="button" title="重命名对话" aria-label="重命名对话" :disabled="!isConnected" @click.stop="renameSession(session)"><i class="el-icon-edit" /></button>
            <button
              class="agent-session-action is-danger"
              type="button"
              title="删除对话"
              aria-label="删除对话"
              :disabled="!isConnected"
              @click.stop="confirmDeleteSession(session)"
            >
              <i class="el-icon-delete" />
            </button>
            </div>
          </div>
          </div>
          <button v-if="nextSessionCursor || sessionsError" class="agent-history-button" type="button" :disabled="sessionsLoading || !isConnected" @click="requestSessions(Boolean(nextSessionCursor) && !sessionsError)">{{ sessionsLoading ? '加载中…' : sessionsError ? '重试加载列表' : '加载更多对话' }}</button>
        </div>
      </div>

      <div class="agent-sidebar__footer">
        <div class="agent-account"><span class="agent-account__avatar">{{ displayName.slice(0, 1) }}</span><span><strong>{{ displayName }}</strong><small><i class="el-icon-lock" /> 私人对话空间</small></span></div>
        <button class="agent-connection" type="button" @click="reconnectNow">
          <span class="agent-connection__dot" :class="'is-' + connectionState" />
          <span>{{ connectionLabel }}</span>
          <i v-if="!isConnected" class="el-icon-refresh" />
        </button>
      </div>
    </aside>

    <main class="agent-main">
      <header class="agent-topbar">
        <button class="agent-icon-button agent-topbar__menu" type="button" aria-label="打开会话列表" @click="mobileSidebarOpen = true">
          <i class="el-icon-s-unfold" />
        </button>
        <div class="agent-topbar__title">
          <span class="agent-topbar__eyebrow">个人助理 / 对话</span>
          <strong>{{ activeTitle }}</strong>
        </div>
        <span v-if="activeModel" class="agent-model-badge"><i class="el-icon-cpu" /> {{ activeModel }}</span>
        <div class="agent-topbar__status" :class="{ 'is-online': isConnected }">
          <span />
          {{ isConnected ? '在线' : connectionLabel }}
        </div>
      </header>

      <div v-if="!isConnected" class="agent-connection-banner">
        <i class="el-icon-warning-outline" />
        <span>{{ connectionDescription }}</span>
        <button type="button" @click="recoverConnection">{{ connectionState === 'auth-expired' ? '重新登录' : '重新连接' }}</button>
      </div>

      <section ref="messageScroller" class="agent-conversation" role="log" aria-label="聊天记录" aria-live="off" @scroll="handleConversationScroll">
        <div v-if="historyErrors[activeSessionId]" class="agent-request-error" role="alert">{{ historyErrors[activeSessionId] }} <button type="button" :disabled="!isConnected" @click="loadSession(activeSessionId)">重试载入</button></div>
        <div v-if="isSessionLoading" class="agent-session-loading">
          <i class="el-icon-loading" />
          <span>正在载入对话</span>
        </div>

        <div v-else-if="!activeState || !activeState.messages.length" class="agent-welcome">
          <div class="agent-welcome__mark">✦</div>
          <span class="agent-welcome__eyebrow">{{ greeting }}，{{ displayName }}</span>
          <h1>从一个问题，<br><em>开始新的探索。</em></h1>
          <p>聊聊你的想法，或让股票助手帮你研究行情、<br class="agent-desktop-break">解读 520 战法，把信息整理成清晰的答案。</p>
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
          <div class="agent-welcome__footnote"><i class="el-icon-lock" /> 对话记录仅当前账号可见</div>
        </div>

        <div v-else class="agent-message-list">
          <button v-if="activeState.nextBefore" class="agent-history-button" type="button" :disabled="loadingOlder || !isConnected" @click="loadOlderMessages">{{ loadingOlder ? '正在加载…' : '加载更早的消息' }}</button>
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
                <span class="agent-message__badge">助手</span>
                <span v-if="isMessageStreaming(message)" class="agent-typing-dot" />
                <time v-else-if="message.timestamp">{{ formatSessionTime(message.timestamp) }}</time>
              </div>
              <div v-else-if="message.role === 'user'" class="agent-message__author is-user">你<time v-if="message.timestamp">{{ formatSessionTime(message.timestamp) }}</time></div>

              <agent-thinking-panel
                v-if="message.thinking"
                :text="message.thinking"
                :streaming="isMessageStreaming(message) && !message.text"
                @layout="handleRichContentLayout"
              />

              <agent-tool-card
                v-for="tool in (message.tools || [])"
                :key="tool.id"
                :tool="tool"
                :now="clockNow"
                @layout="handleRichContentLayout"
              />

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

      <button v-if="userPinnedScroll && activeState && !activeState.hasNewer" class="agent-jump-latest" type="button" aria-label="回到最新消息" @click="scrollToBottom(true)"><i class="el-icon-bottom" /> 最新消息</button>

      <footer class="agent-composer-area">
        <button v-if="activeState && activeState.hasNewer" class="agent-history-button" type="button" :disabled="!isConnected" @click="loadSession(activeSessionId)">回到最新消息</button>
        <div v-if="activeState && activeState.isStreaming" class="agent-run-status" role="status" aria-live="polite"><i class="el-icon-loading" /> {{ runPhaseLabel }} <span>{{ runElapsed }}</span></div>
        <div v-if="activeState && activeState.sendError" class="agent-request-error" role="alert">{{ activeState.sendError }} <button type="button" :disabled="!isConnected || activeState.isStreaming" @click="retryFailedPrompt">{{ activeState.delivery === 'unknown' ? '取回问题' : activeState.delivery === 'accepted' ? '重新提问' : '重试发送' }}</button></div>
        <div class="agent-composer" :class="{ 'is-focused': composerFocused, 'is-disabled': !isConnected }">
          <el-input
            ref="composer"
            v-model="inputText"
            class="agent-composer__input"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 6 }"
            maxlength="12000"
            resize="none"
            :disabled="connectionState === 'auth-expired' || connectionState === 'forbidden'"
            :placeholder="isConnected ? '写下你的问题，让想法更进一步…' : '可以先写下问题，连接恢复后发送'"
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
            :disabled="activeState.stopRequested || !isConnected"
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
          <span><kbd>Enter</kbd> 发送 <span class="agent-composer__separator">·</span> <kbd>Shift + Enter</kbd> 换行</span>
          <span v-if="contextLabel">{{ contextLabel }}</span>
          <span v-else>Agent 的回答可能存在偏差，请核对重要信息</span>
        </div>
      </footer>
    </main>
    <agent-permission-dialog
      v-if="pendingPermission"
      :key="pendingPermission.id"
      :request="pendingPermission"
      :busy="permissionRespondingId === pendingPermission.id"
      :remaining="permissionRequests.length"
      :session-title="permissionSessionTitle"
      @decide="respondPermission"
    />
  </div>
</template>

<script>
import { AGENT_PROTOCOL_VERSION, getAgentWebSocketUrl } from '@/utils/agentSocket'
import { getToken } from '@/utils/auth'
import { groupSessions, draftKey, toolDescription, toolPreview, MAX_CACHED_SESSIONS, MAX_VISIBLE_MESSAGES } from '@/utils/agent-chat-state'
import AgentMarkdown from './components/AgentMarkdown.vue'
import AgentThinkingPanel from './components/AgentThinkingPanel.vue'
import AgentPermissionDialog from './components/AgentPermissionDialog.vue'
import AgentToolCard from './components/AgentToolCard.vue'

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default {
  name: 'AgentChat',
  components: { AgentMarkdown, AgentThinkingPanel, AgentPermissionDialog, AgentToolCard },
  data() {
    return {
      socketClient: null,
      connectionToken: '',
      draftUserId: '',
      authFailedToken: '',
      connectionError: '',
      handshakeTimer: null,
      clockTimer: null,
      clockNow: Date.now(),
      sessionQuery: '',
      nextSessionCursor: null,
      sessionsLoading: false,
      sessionsError: '',
      latestSessionRequestId: '',
      searchTimer: null,
      pendingRequests: {},
      historyErrors: {},
      loadingOlder: false,
      eventQueue: [],
      eventFlushTimer: null,
      pendingLiveEvents: {},
      latestLoadRequests: {},
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
      permissionRequests: [],
      permissionRespondingId: '',
      permissionResponseRequestId: '',
      expandedTools: {},
      userPinnedScroll: false,
      endpointLabel: '/agent-ws',
      suggestions: [
        { title: '查询最新行情', description: '查看报价、涨跌幅和行情时间', prompt: '请帮我查询 600519 的最新行情，并注明数据来源和行情时间。', icon: 'el-icon-data-line' },
        { title: '520 战法分析', description: '按趋势、买点和执行解读证据', prompt: '请用 520 战法分析 510300，说明趋势、买点和判断依据。', icon: 'el-icon-data-analysis' },
        { title: '研究股票资讯', description: '搜索公开新闻并提供来源链接', prompt: '请联网查询贵州茅台近期的公司公告和相关新闻，区分事实与推断，并附上来源链接和日期。', icon: 'el-icon-search' },
        { title: '了解均线方法', description: '学习 MA5、MA20 与信号含义', prompt: '请解释 520 均线战法中 MA5 和 MA20 的作用，以及金叉、回踩和粘合买点有什么区别。', icon: 'el-icon-reading' }
      ]
    }
  },
  computed: {
    displayName() {
      const user = this.$store && this.$store.state.user
      return user && (user.nickName || user.name) || '朋友'
    },
    greeting() {
      const hour = new Date(this.clockNow).getHours()
      return hour < 6 ? '夜深了' : hour < 12 ? '上午好' : hour < 18 ? '下午好' : '晚上好'
    },
    shortcutLabel() { return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⌘ N' : 'Ctrl N' },
    pendingPermission() {
      return this.permissionRequests[0] || null
    },
    permissionSessionTitle() {
      const session = this.pendingPermission && this.sessions.find(item => item.id === this.pendingPermission.sessionId)
      return session ? session.title : ''
    },
    isConnected() {
      return this.connectionState === 'connected'
    },
    sortedSessions() {
      const query = this.sessionQuery.trim().toLowerCase()
      return this.sessions.filter(session => !query || String(session.title).toLowerCase().includes(query)).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    },
    sessionGroups() {
      return groupSessions(this.sortedSessions, this.clockNow)
    },
    connectionDescription() {
      if (this.connectionError) return this.connectionError
      const labels = { connecting: '正在连接 Agent 服务…', authenticating: '正在验证工作台登录身份…', reconnecting: '连接中断，正在自动重连，草稿已保留。', 'service-unavailable': '工作台服务暂不可用，正在自动重连，草稿已保留。', 'auth-expired': '登录已失效，请重新登录。', forbidden: '当前账号没有 Agent 助手访问权限。' }
      return labels[this.connectionState] || '暂时无法连接 Agent 服务，草稿已保留。'
    },
    runPhaseLabel() {
      if (!this.isConnected) return '连接中断，恢复后同步执行结果'
      if (this.activeState && this.activeState.stopRequested) return '正在停止生成'
      const labels = { waiting: '等待 Agent 回复', thinking: '正在思考', tool: '正在执行工具', answering: '正在生成回答' }
      return labels[this.activeState && this.activeState.phase] || labels.waiting
    },
    runElapsed() {
      const started = this.activeState && new Date(this.activeState.startedAt).getTime()
      return started ? `已等待 ${Math.max(0, Math.floor((this.clockNow - started) / 1000))} 秒` : ''
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
        authenticating: '验证身份中…',
        reconnecting: '正在重连…',
        'service-unavailable': '服务暂不可用',
        'auth-expired': '登录已过期',
        forbidden: '无访问权限',
        disconnected: '未连接'
      }
      return labels[this.connectionState] || '未连接'
    },
    canSubmit() {
      if (!this.isConnected || this.creatingSession || !this.inputText.trim()) return false
      if (this.activeSessionId && this.loadingSessionIds[this.activeSessionId]) return false
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
  watch: {
    inputText() { this.saveDraft() },
    '$store.state.user.token'() {
      this.handleIdentityChange()
    }
  },
  mounted() {
    this.endpointLabel = process.env.VUE_APP_AGENT_WS_URL || '/agent-ws'
    window.addEventListener('keydown', this.handleGlobalShortcut)
    window.addEventListener('focus', this.handleWindowFocus)
    this.clockTimer = setInterval(() => { this.clockNow = Date.now() }, 1000)
    this.connectSocket()
  },
  beforeDestroy() {
    this.saveDraft()
    this.componentDestroyed = true
    window.removeEventListener('keydown', this.handleGlobalShortcut)
    window.removeEventListener('focus', this.handleWindowFocus)
    this.clearSocketTimers()
    if (this.clockTimer) clearInterval(this.clockTimer)
    if (this.searchTimer) clearTimeout(this.searchTimer)
    this.clearPendingRequests()
    this.clearEventQueue()
    if (this.socketClient) {
      this.socketClient.onclose = null
      this.socketClient.close(1000, 'Page closed')
      this.socketClient = null
    }
  },
  methods: {
    saveDraft() {
      if (!this.draftUserId || !this.connectionToken || this.connectionToken !== getToken()) return
      try {
        const key = draftKey(this.draftUserId, this.activeSessionId)
        const state = this.activeState
        const unsent = state && ['sending', 'unknown', 'rejected'].includes(state.delivery) ? state.lastPrompt : this.pendingPrompt
        const text = this.inputText || unsent
        if (text) window.sessionStorage.setItem(key, text)
        else window.sessionStorage.removeItem(key)
      } catch (_) { /* Storage may be disabled; the in-memory draft still works. */ }
    },
    readDraft(sessionId) {
      if (!this.draftUserId) return ''
      try { return window.sessionStorage.getItem(draftKey(this.draftUserId, sessionId)) || '' } catch (_) { return '' }
    },
    switchDraft(sessionId) {
      this.saveDraft()
      this.activeSessionId = sessionId
      this.inputText = this.readDraft(sessionId)
    },
    scheduleSessionSearch() {
      if (this.searchTimer) clearTimeout(this.searchTimer)
      this.searchTimer = setTimeout(() => this.requestSessions(false), 300)
    },
    requestSessions(append = false) {
      const requestId = createId('sessions')
      this.latestSessionRequestId = requestId
      this.sessionsError = ''
      this.sessionsLoading = true
      if (!this.sendSocket({ type: 'list_sessions', query: this.sessionQuery.trim(), cursor: append ? this.nextSessionCursor : undefined, requestId })) this.sessionsLoading = false
    },
    renameSession(session) {
      this.$prompt('输入新的对话标题（最多64字）', '重命名对话', { inputValue: session.title, inputValidator: value => Boolean(value && value.trim() && value.length <= 64) || '请输入1至64字的标题' }).then(({ value }) => {
        this.sendSocket({ type: 'rename_session', sessionId: session.id, title: value.trim(), requestId: createId('rename') })
      }).catch(() => {})
    },
    trackRequest(message) {
      if (!message.requestId || !['create_session', 'load_session', 'list_sessions', 'rename_session', 'prompt', 'abort'].includes(message.type)) return
      const request = { ...message }
      request.timer = setTimeout(() => {
        delete this.pendingRequests[message.requestId]
        this.failRequest(request, '请求超时，请重试。', message.type === 'prompt')
      }, message.type === 'prompt' ? 20000 : 15000)
      this.pendingRequests[message.requestId] = request
    },
    finishRequest(requestId) {
      const request = requestId && this.pendingRequests[requestId]
      if (!request) return null
      clearTimeout(request.timer)
      delete this.pendingRequests[requestId]
      return request
    },
    clearPendingRequests(reason) {
      Object.keys(this.pendingRequests).forEach(id => {
        const request = this.finishRequest(id)
        if (reason) this.failRequest(request, reason, request.type === 'prompt')
      })
    },
    failRequest(request, reason, uncertain = false) {
      if (!request) return
      if (request.type === 'load_session') {
        this.$delete(this.loadingSessionIds, request.sessionId)
        this.loadingOlder = false
        this.$set(this.historyErrors, request.sessionId, reason)
      } else if (request.type === 'list_sessions') {
        if (request.query !== this.sessionQuery.trim() || request.requestId !== this.latestSessionRequestId) return
        this.sessionsLoading = false
        this.sessionsError = reason
      } else if (request.type === 'create_session') {
        this.creatingSession = false
        if (this.pendingPrompt) this.inputText = this.pendingPrompt
        this.pendingPrompt = ''
        this.saveDraft()
      } else if (request.type === 'prompt') {
        const state = this.sessionStates[request.sessionId]
        if (!state) return
        state.isStreaming = false
        state.delivery = uncertain ? 'unknown' : 'rejected'
        state.sendError = uncertain ? '连接中断或确认超时，尚不能确认消息是否送达。恢复连接后请检查历史，可取回问题继续编辑。' : reason
        state.lastPrompt = request.text
        this.saveDraft()
        if (!uncertain) state.messages = state.messages.filter(message => message.id !== state.optimisticId)
      } else if (request.type === 'abort') {
        const state = this.sessionStates[request.sessionId]
        if (state) state.stopRequested = false
        this.$message.warning(reason)
      } else if (request.type === 'rename_session') {
        this.$message.warning(reason)
      }
    },
    retryFailedPrompt() {
      const state = this.activeState
      if (!state || !state.lastPrompt || state.isStreaming) return
      if (state.delivery === 'unknown') {
        this.inputText = state.lastPrompt
        state.messages = state.messages.filter(message => message.id !== state.optimisticId)
        state.delivery = 'draft'
        state.sendError = ''
        this.saveDraft()
        this.focusComposer()
        return
      }
      this.sendPromptToActive(state.lastPrompt)
    },
    clearEventQueue() {
      if (this.eventFlushTimer) clearTimeout(this.eventFlushTimer)
      this.eventFlushTimer = null
      this.eventQueue = []
    },
    queueAgentEvent(event) {
      const last = this.eventQueue[this.eventQueue.length - 1]
      const canMerge = event.sequence === undefined && last && last.sequence === undefined
      if (canMerge && ['text_delta', 'thinking_delta'].includes(event.type) && last.type === event.type && last.sessionId === event.sessionId) last.delta += event.delta || ''
      else if (canMerge && event.type === 'tool_update' && last.type === event.type && last.sessionId === event.sessionId && last.toolCallId === event.toolCallId) last.output = event.output
      else this.eventQueue.push(event)
      if (this.eventQueue.length >= 500) { this.flushAgentEvents(); return }
      if (!this.eventFlushTimer) this.eventFlushTimer = setTimeout(() => this.flushAgentEvents(), 40)
    },
    bufferLiveEvent(event) {
      const pending = this.pendingLiveEvents[event.sessionId] || []
      pending.push(event)
      if (pending.length > 500) pending.shift()
      this.pendingLiveEvents[event.sessionId] = pending
      if (!this.loadingSessionIds[event.sessionId]) this.loadSession(event.sessionId)
    },
    flushAgentEvents() {
      if (this.eventFlushTimer) clearTimeout(this.eventFlushTimer)
      this.eventFlushTimer = null
      const events = this.eventQueue
      this.eventQueue = []
      events.forEach(event => this.applyAgentEvent(event))
    },
    evictSessionCache() {
      const idle = Object.keys(this.sessionStates).filter(id => id !== this.activeSessionId && !this.sessionStates[id].isStreaming)
        .sort((a, b) => (this.sessionStates[a].lastAccessAt || 0) - (this.sessionStates[b].lastAccessAt || 0))
      while (Object.keys(this.sessionStates).length > MAX_CACHED_SESSIONS && idle.length) {
        const id = idle.shift()
        this.sessionStates[id].messages.forEach(message => message.tools.forEach(tool => this.$delete(this.expandedTools, tool.id)))
        this.$delete(this.sessionStates, id)
      }
    },
    loadOlderMessages() {
      if (!this.activeState || !this.activeState.nextBefore || this.loadingOlder) return
      this.loadingOlder = true
      this.$delete(this.historyErrors, this.activeSessionId)
      if (!this.sendSocket({ type: 'load_session', sessionId: this.activeSessionId, before: this.activeState.nextBefore, requestId: createId('older') })) this.loadingOlder = false
    },
    describeTool: toolDescription,
    previewTool: toolPreview,
    toolDuration(tool) {
      const duration = tool.durationMs === undefined && tool.status === 'running' && tool.startedAt ? this.clockNow - new Date(tool.startedAt).getTime() : tool.durationMs
      return Number.isFinite(duration) ? `${Math.max(0, duration / 1000).toFixed(1)}秒` : ''
    },
    resetIdentityConnection() {
      this.saveDraft()
      this.draftUserId = ''
      this.clearSocketTimers()
      this.clearPendingRequests()
      this.clearEventQueue()
      if (this.socketClient) {
        this.socketClient.onclose = null
        this.socketClient.close(1000, 'Identity changed')
        this.socketClient = null
      }
      this.connectionToken = ''
      this.connectionState = 'disconnected'
      this.sessions = []
      this.sessionStates = {}
      this.loadingSessionIds = {}
      this.activeSessionId = null
      this.inputText = ''
      this.pendingPrompt = ''
      this.creatingSession = false
      this.historyErrors = {}
      this.pendingLiveEvents = {}
      this.latestLoadRequests = {}
      this.sessionQuery = ''
      this.nextSessionCursor = null
      this.sessionsLoading = false
      this.loadingOlder = false
      if (this.searchTimer) clearTimeout(this.searchTimer)
      this.searchTimer = null
      this.expandedTools = {}
      this.copiedMessageId = ''
      this.clearPermissions()
    },
    handleIdentityChange() {
      if (this.authFailedToken && this.authFailedToken === getToken()) return
      if (this.connectionToken === (getToken() || '')) return
      this.resetIdentityConnection()
      this.reconnectAttempts = 0
      this.authFailedToken = ''
      if (getToken() && !this.componentDestroyed) this.connectSocket()
    },
    handleWindowFocus() {
      this.handleIdentityChange()
      if (this.isConnected && this.activeSessionId) this.loadSession(this.activeSessionId)
    },
    connectSocket() {
      const token = getToken()
      if (!token) {
        this.resetIdentityConnection()
        return
      }
      if (this.componentDestroyed || !window.WebSocket) {
        this.connectionState = 'disconnected'
        return
      }
      if (this.socketClient && (this.socketClient.readyState === WebSocket.OPEN || this.socketClient.readyState === WebSocket.CONNECTING)) return

      this.connectionState = this.reconnectAttempts ? 'reconnecting' : 'connecting'
      this.connectionError = ''
      let socket
      try {
        socket = new WebSocket(getAgentWebSocketUrl())
      } catch (error) {
        this.connectionState = 'disconnected'
        this.$message.error('Agent WebSocket 地址无效，请检查环境配置')
        return
      }
      this.socketClient = socket
      this.connectionToken = token

      socket.onopen = () => {
        if (this.socketClient !== socket) return
        this.connectionState = 'authenticating'
        this.handshakeTimer = setTimeout(() => { this.connectionError = '登录验证超时，正在重新连接，草稿已保留。'; socket.close() }, 15000)
        this.sendSocket({ type: 'init', protocolVersion: AGENT_PROTOCOL_VERSION, accessToken: token, requestId: createId('init') })
      }

      socket.onmessage = event => {
        if (this.socketClient !== socket) return
        if (this.connectionToken !== (getToken() || '')) {
          this.handleIdentityChange()
          return
        }
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
        if (['agent_start', 'text_delta', 'thinking_delta', 'tool_start', 'tool_update', 'tool_end', 'message_end', 'agent_end', 'session_updated'].includes(message.type)) {
          this.queueAgentEvent(message)
          return
        }
        this.flushAgentEvents()
        this.handleServerMessage(message)
      }

      socket.onerror = () => socket.close()
      socket.onclose = event => {
        if (this.socketClient !== socket) return
        if (event.code === 4401 || event.code === 4403) {
          this.authFailedToken = this.connectionToken
          this.resetIdentityConnection()
          this.connectionState = event.code === 4401 ? 'auth-expired' : 'forbidden'
          return
        }
        this.flushAgentEvents()
        this.clearPendingRequests('连接已中断，请恢复连接后重试。')
        this.pendingLiveEvents = {}
        this.latestLoadRequests = {}
        this.socketClient = null
        this.stopHeartbeat()
        this.clearPermissions()
        if (this.componentDestroyed) return
        if (this.handshakeTimer) clearTimeout(this.handshakeTimer)
        this.handshakeTimer = null
        this.connectionState = event.code === 1013 ? 'service-unavailable' : 'reconnecting'
        const delay = Math.min(15000, 800 * Math.pow(2, Math.min(this.reconnectAttempts++, 5))) + Math.random() * 350
        this.reconnectTimer = setTimeout(() => this.connectSocket(), delay)
      }
    },
    reconnectNow() {
      if (this.isConnected) return
      this.clearSocketTimers()
      this.clearPendingRequests('连接正在重建，请稍后重试。')
      if (this.socketClient) {
        this.socketClient.onclose = null
        this.socketClient.close()
        this.socketClient = null
      }
      this.clearPermissions()
      this.authFailedToken = ''
      this.reconnectAttempts = 0
      this.connectSocket()
    },
    recoverConnection() {
      if (this.connectionState === 'auth-expired') {
        this.$router.push({ path: '/login', query: { redirect: this.$route.fullPath } })
      } else this.reconnectNow()
    },
    clearSocketTimers() {
      if (this.handshakeTimer) clearTimeout(this.handshakeTimer)
      this.handshakeTimer = null
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
      if (this.connectionToken !== (getToken() || '')) {
        this.handleIdentityChange()
        return false
      }
      if (!this.socketClient || this.socketClient.readyState !== WebSocket.OPEN) {
        if (notify) this.$message.warning('Agent 尚未连接，请稍后重试')
        return false
      }
      try {
        this.socketClient.send(JSON.stringify(message))
        this.trackRequest(message)
        return true
      } catch (_) {
        if (notify) this.$message.warning('消息未发出，连接正在恢复')
        this.socketClient.close()
        return false
      }
    },
    handleServerMessage(message) {
      const request = this.finishRequest(message.requestId)
      switch (message.type) {
        case 'init':
          if (this.handshakeTimer) clearTimeout(this.handshakeTimer)
          this.handshakeTimer = null
          this.reconnectAttempts = 0
          this.connectionError = ''
          this.connectionState = 'connected'
          this.draftUserId = message.userId || String(this.$store && this.$store.state.user.id || '')
          this.inputText = this.readDraft(this.activeSessionId)
          this.startHeartbeat()
          this.sessions = Array.isArray(message.sessions) ? message.sessions : []
          this.nextSessionCursor = message.nextCursor || null
          if (this.sessionQuery) this.requestSessions()
          if (this.activeSessionId) {
            this.loadSession(this.activeSessionId)
          } else if (!this.inputText && this.sortedSessions.length) {
            this.selectSession(this.sortedSessions[0].id)
          } else {
            this.activeSessionId = null
          }
          Object.keys(this.sessionStates).filter(id => id !== this.activeSessionId && this.sessionStates[id].isStreaming).forEach(id => this.loadSession(id))
          break
        case 'sessions':
          if (!request || request.query !== this.sessionQuery.trim() || message.requestId !== this.latestSessionRequestId) break
          this.sessionsLoading = false
          this.sessionsError = ''
          this.sessions = request.cursor ? this.sessions : []
          ;(message.sessions || []).forEach(summary => this.upsertSessionSummary(summary))
          this.nextSessionCursor = message.nextCursor || null
          break
        case 'session_created': {
          if (message.requestId && !request) {
            this.upsertSessionSummary(message.session.summary)
            break
          }
          const draft = this.inputText
          this.creatingSession = false
          this.installSnapshot(message.session)
          this.switchDraft(message.session.summary.id)
          if (draft) this.inputText = draft
          if (this.pendingPrompt) {
            const prompt = this.pendingPrompt
            this.pendingPrompt = ''
            try { window.sessionStorage.removeItem(draftKey(this.draftUserId, null)) } catch (_) { /* Optional local storage. */ }
            this.$nextTick(() => this.sendPromptToActive(prompt, true))
          }
          break
        }
        case 'session_state':
          this.installSnapshot(message.session, message.requestId)
          break
        case 'history_page': {
          this.loadingOlder = false
          const state = this.sessionStates[message.sessionId]
          if (!state) break
          const scroller = this.$refs && this.$refs.messageScroller
          const height = scroller ? scroller.scrollHeight : 0
          const top = scroller ? scroller.scrollTop : 0
          const known = new Set(state.messages.map(item => item.id))
          const combined = (message.messages || []).filter(item => !known.has(item.id)).map(this.normalizeMessage).concat(state.messages)
          if (combined.length > MAX_VISIBLE_MESSAGES) state.hasNewer = true
          combined.slice(MAX_VISIBLE_MESSAGES).forEach(item => item.tools.forEach(tool => this.$delete(this.expandedTools, tool.id)))
          state.messages = combined.slice(0, MAX_VISIBLE_MESSAGES)
          state.nextBefore = message.nextBefore || null
          this.$nextTick(() => { if (scroller && this.activeSessionId === message.sessionId) scroller.scrollTop = top + scroller.scrollHeight - height })
          break
        }
        case 'session_renamed': {
          const summary = this.sessions.find(item => item.id === message.sessionId)
          if (summary) this.upsertSessionSummary({ ...summary, title: message.title })
          const state = this.sessionStates[message.sessionId]
          if (state) state.summary.title = message.title
          break
        }
        case 'prompt_accepted': {
          const state = this.sessionStates[message.sessionId]
          if (state) {
            state.delivery = 'accepted'
            state.sendError = ''
            state.isStreaming = true
          }
          this.saveDraft()
          break
        }
        case 'session_deleted':
          this.removeSessionLocally(message.sessionId)
          break
        case 'permission_request':
          if (message.permission && !this.permissionRequests.some(item => item.id === message.permission.id)) {
            this.permissionRequests.push(message.permission)
          }
          break
        case 'permission_resolved':
          this.permissionRequests = this.permissionRequests.filter(item => item.id !== message.permissionId)
          if (this.permissionRespondingId === message.permissionId) {
            this.permissionRespondingId = ''
            this.permissionResponseRequestId = ''
          }
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
          if (message.code === 'SERVICE_UNAVAILABLE') {
            if (request) this.failRequest(request, message.message, request.type === 'prompt')
            this.connectionError = message.message
            this.connectionState = 'service-unavailable'
            break
          }
          if (message.code === 'AUTH_REQUIRED' || message.code === 'FORBIDDEN') {
            this.authFailedToken = this.connectionToken
            this.resetIdentityConnection()
            this.connectionState = message.code === 'AUTH_REQUIRED' ? 'auth-expired' : 'forbidden'
            this.connectionError = message.message
            this.$message.error(message.message || '登录已失效或无权访问 Agent 助手')
            return
          }
          if (message.requestId && message.requestId === this.permissionResponseRequestId) {
            this.permissionRespondingId = ''
            this.permissionResponseRequestId = ''
          }
          this.failRequest(request, message.message || '请求失败')
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
    installSnapshot(snapshot, requestId) {
      if (!snapshot || !snapshot.summary) return
      const id = snapshot.summary.id
      if (requestId && String(requestId).startsWith('load-') && this.latestLoadRequests[id] !== requestId) return
      const existing = this.sessionStates[id]
      if (snapshot.epoch && existing && existing.epoch === snapshot.epoch && existing.sequence > snapshot.sequence) {
        this.$delete(this.loadingSessionIds, id)
        delete this.latestLoadRequests[id]
        this.replayLiveEvents(id)
        return
      }
      const messages = Array.isArray(snapshot.messages) ? snapshot.messages.map(this.normalizeMessage) : []
      if (!snapshot.isStreaming) messages.forEach(message => message.tools.forEach(tool => {
        if (tool.status === 'running') {
          tool.status = 'error'
          tool.output = tool.output || '执行已中断，没有收到完整的工具结果。'
        }
      }))
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
        contextUsage: snapshot.contextUsage || null,
        primaryAgentId: snapshot.primaryAgentId || 'general',
        nextBefore: snapshot.nextBefore || null,
        hasNewer: false,
        lastAccessAt: Date.now(),
        phase: snapshot.phase || 'waiting',
        startedAt: snapshot.startedAt || '',
        lastPrompt: (messages.slice().reverse().find(message => message.role === 'user') || {}).text || '',
        sendError: '',
        delivery: '',
        optimisticId: '',
        stopRequested: false,
        epoch: snapshot.epoch || '',
        sequence: snapshot.sequence === undefined ? 0 : snapshot.sequence
      }
      const previous = this.sessionStates[snapshot.summary.id]
      if (previous && ['unknown', 'rejected'].includes(previous.delivery)) {
        state.lastPrompt = previous.lastPrompt
        state.delivery = snapshot.isStreaming ? 'accepted' : previous.delivery
        state.sendError = snapshot.isStreaming ? '' : previous.sendError
      }
      const last = messages[messages.length - 1]
      if (!snapshot.isStreaming && last && last.error) {
        const question = [...messages].reverse().find(item => item.role === 'user')
        state.lastPrompt = question ? question.text : ''
        state.delivery = 'accepted'
        state.sendError = last.error
      }
      this.$set(this.sessionStates, snapshot.summary.id, state)
      this.$delete(this.loadingSessionIds, snapshot.summary.id)
      delete this.latestLoadRequests[id]
      this.$delete(this.historyErrors, snapshot.summary.id)
      this.upsertSessionSummary(snapshot.summary)
      this.evictSessionCache()
      this.replayLiveEvents(id)
      if (snapshot.summary.id === this.activeSessionId) this.$nextTick(() => this.scrollToBottom(true))
    },
    upsertSessionSummary(summary) {
      const index = this.sessions.findIndex(item => item.id === summary.id)
      if (index >= 0) this.$set(this.sessions, index, { ...this.sessions[index], ...summary })
      else this.sessions.push({ ...summary })
    },
    replayLiveEvents(sessionId) {
      const pending = this.pendingLiveEvents[sessionId] || []
      delete this.pendingLiveEvents[sessionId]
      const state = this.sessionStates[sessionId]
      if (!state || !pending.length) return
      const latest = pending[pending.length - 1]
      if (latest.epoch && state.epoch !== latest.epoch) {
        this.pendingLiveEvents[sessionId] = pending
        this.loadSession(sessionId)
        return
      }
      pending.filter(event => !event.epoch || event.epoch === state.epoch).forEach(event => this.applyAgentEvent(event, true))
    },
    applyAgentEvent(event, replaying = false) {
      const current = this.sessionStates[event.sessionId]
      if (current && event.epoch && Number.isInteger(event.sequence)) {
        if (current.epoch === event.epoch && event.sequence <= current.sequence) return
        if ((!replaying && this.loadingSessionIds[event.sessionId]) || current.epoch !== event.epoch || event.sequence > current.sequence + 1) {
          this.bufferLiveEvent(event)
          return
        }
        current.epoch = event.epoch
        current.sequence = event.sequence
      }
      if (event.type === 'session_updated' && event.summary) this.upsertSessionSummary(event.summary)
      const state = this.sessionStates[event.sessionId]
      if (!state) {
        if (event.sessionId === this.activeSessionId) this.bufferLiveEvent(event)
        return
      }
      if (state.hasNewer && !['agent_end', 'session_updated'].includes(event.type)) {
        if (event.type === 'agent_start') {
          state.isStreaming = true
          state.startedAt = new Date().toISOString()
          state.phase = 'waiting'
        }
        return
      }

      const shouldStick = event.sessionId === this.activeSessionId && this.isNearBottom()
      switch (event.type) {
        case 'agent_start':
          state.isStreaming = true
          state.phase = 'waiting'
          state.startedAt = state.startedAt || new Date().toISOString()
          break
        case 'text_delta': {
          state.isStreaming = true
          state.phase = 'answering'
          const assistant = this.ensureAssistantMessage(state)
          assistant.text += event.delta || ''
          break
        }
        case 'thinking_delta': {
          state.isStreaming = true
          state.phase = 'thinking'
          const assistant = this.ensureAssistantMessage(state)
          assistant.thinking += event.delta || ''
          break
        }
        case 'tool_start': {
          state.isStreaming = true
          state.phase = 'tool'
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
            if (event.durationMs !== undefined) this.$set(tool, 'durationMs', event.durationMs)
            if (event.type === 'tool_end') state.phase = state.messages.some(message => message.tools.some(item => item.status === 'running')) ? 'tool' : 'waiting'
          }
          break
        }
        case 'message_end':
          this.finishMessage(state, event.message)
          break
        case 'agent_end': {
          const stopped = state.stopRequested
          state.isStreaming = false
          state.stopRequested = false
          state.streamMessageId = ''
          state.messages.forEach(message => message.tools.forEach(tool => {
            if (tool.status === 'running') {
              tool.status = 'error'
              tool.output = tool.output || '执行已结束，没有收到完整的工具结果。'
            }
          }))
          if (event.contextUsage) state.contextUsage = event.contextUsage
          if (event.error) {
            state.sendError = event.error
            if (state.delivery !== 'rejected' && !state.hasNewer) {
              state.delivery = 'accepted'
              const last = state.messages[state.messages.length - 1]
              if (last && last.role === 'assistant') this.$set(last, 'error', event.error)
              else state.messages.push(this.normalizeMessage({ role: 'assistant', error: event.error }))
            }
          } else {
            state.sendError = stopped ? '已停止生成，可以重新提问。' : ''
            state.delivery = 'accepted'
          }
          this.evictSessionCache()
          break
        }
        case 'session_updated':
          if (event.summary) state.summary = { ...event.summary }
          if (event.model) state.model = event.model
          if (event.thinkingLevel) state.thinkingLevel = event.thinkingLevel
          if (event.contextUsage) state.contextUsage = event.contextUsage
          if (event.primaryAgentId) state.primaryAgentId = event.primaryAgentId
          break
        default:
          break
      }

      if (state.messages.length > MAX_VISIBLE_MESSAGES) {
        state.messages.slice(0, -MAX_VISIBLE_MESSAGES).forEach(message => message.tools.forEach(tool => this.$delete(this.expandedTools, tool.id)))
        state.messages = state.messages.slice(-MAX_VISIBLE_MESSAGES)
        state.nextBefore = state.messages[0].id
      }

      if (shouldStick) this.$nextTick(() => this.scrollToBottom())
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
      if (this.creatingSession) return
      this.switchDraft(null)
      this.pendingPrompt = ''
      this.mobileSidebarOpen = false
      this.$nextTick(() => this.focusComposer())
    },
    selectSession(sessionId) {
      this.switchDraft(sessionId)
      if (this.sessionStates[sessionId]) this.sessionStates[sessionId].lastAccessAt = Date.now()
      this.mobileSidebarOpen = false
      this.loadSession(sessionId)
      this.$nextTick(() => this.scrollToBottom(true))
    },
    loadSession(sessionId) {
      if (!sessionId || this.loadingSessionIds[sessionId]) return
      if (!this.isConnected) {
        this.$set(this.historyErrors, sessionId, '连接恢复后可重新载入历史消息。')
        return
      }
      this.$set(this.loadingSessionIds, sessionId, true)
      this.$delete(this.historyErrors, sessionId)
      const requestId = createId('load')
      this.latestLoadRequests[sessionId] = requestId
      if (!this.sendSocket({ type: 'load_session', sessionId, requestId })) {
        this.$delete(this.loadingSessionIds, sessionId)
        delete this.latestLoadRequests[sessionId]
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
    sendPromptToActive(prompt, preserveDraft = false) {
      const state = this.activeState
      if (!state || state.isStreaming) return
      if (this.loadingSessionIds[this.activeSessionId]) { this.$message.warning('正在同步对话，请稍后发送'); return }
      if (state.hasNewer) {
        this.$message.warning('请先回到最新消息，再继续提问')
        return
      }
      const requestId = createId('prompt')
      if (!this.sendSocket({ type: 'prompt', sessionId: this.activeSessionId, text: prompt, requestId })) return
      state.optimisticId = createId('optimistic')
      state.messages.push(this.normalizeMessage({
        id: state.optimisticId,
        role: 'user',
        text: prompt,
        timestamp: new Date().toISOString()
      }))
      state.isStreaming = true
      state.phase = 'waiting'
      state.startedAt = new Date().toISOString()
      state.lastPrompt = prompt
      state.sendError = ''
      state.delivery = 'sending'
      if (!state.summary.title) state.summary.title = prompt.slice(0, 48)
      if (!preserveDraft) this.inputText = ''
      this.saveDraft()
      this.userPinnedScroll = false
      this.$nextTick(() => this.scrollToBottom(true))
    },
    abortGeneration() {
      if (!this.activeSessionId) return
      if (this.activeState && this.activeState.stopRequested) return
      if (this.sendSocket({ type: 'abort', sessionId: this.activeSessionId, requestId: createId('abort') }) && this.activeState) this.activeState.stopRequested = true
    },
    handleComposerEnter(event) {
      if (event.isComposing || event.shiftKey) return
      event.preventDefault()
      this.submitPrompt()
    },
    handleGlobalShortcut(event) {
      if (event.key === 'Escape') this.mobileSidebarOpen = false
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
      this.$delete(this.historyErrors, sessionId)
      delete this.latestLoadRequests[sessionId]
      delete this.pendingLiveEvents[sessionId]
      if (this.activeSessionId === sessionId) {
        this.switchDraft(null)
        if (this.sortedSessions.length) this.selectSession(this.sortedSessions[0].id)
      }
      try { if (this.draftUserId) window.sessionStorage.removeItem(draftKey(this.draftUserId, sessionId)) } catch (_) { /* Optional local storage. */ }
    },
    isMessageStreaming(message) {
      return Boolean(this.activeState && this.activeState.isStreaming && this.activeState.streamMessageId === message.id)
    },
    clearPermissions() {
      this.permissionRequests = []
      this.permissionRespondingId = ''
      this.permissionResponseRequestId = ''
    },
    respondPermission(decision) {
      const permission = this.pendingPermission
      if (!permission || this.permissionRespondingId) return
      const requestId = createId('permission')
      if (this.sendSocket({ type: 'permission_response', permissionId: permission.id, decision, requestId })) {
        this.permissionRespondingId = permission.id
        this.permissionResponseRequestId = requestId
      }
    },
    toggleTool(toolId) {
      this.$set(this.expandedTools, toolId, !this.expandedTools[toolId])
    },
    toolLabel(name) {
      const labels = {
        read: '读取文件', write: '写入文件', edit: '编辑文件', bash: '运行命令',
        grep: '搜索内容', find: '查找文件', ls: '浏览目录', web_search: '搜索网络',
        web_fetch: '读取网页', subagent: '调用子 Agent', Agent: '股票分析子 Agent',
        stock_search: '检索股票名称', stock_quote: '查询股票行情',
        stock_kline: '查询日 K 线', stock_analyze: '520 战法分析'
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

<style lang="scss" scoped src="./chat.scss" />
