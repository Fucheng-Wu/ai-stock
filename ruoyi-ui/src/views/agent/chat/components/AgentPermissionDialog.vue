<template>
  <el-dialog
    title="允许代理执行此操作？"
    :visible="true"
    width="560px"
    custom-class="agent-permission-dialog"
    append-to-body
    :close-on-click-modal="false"
    :show-close="!busy"
    :close-on-press-escape="!busy"
    :before-close="deny"
  >
    <div class="agent-permission">
      <p>{{ request.agentName }} · {{ sessionTitle || request.sessionId.slice(0, 8) }}</p>
      <p>代理正在等待你的决定。允许后将继续执行，拒绝后会把结果返回给代理。</p>
      <dl>
        <dt>工具</dt><dd>{{ request.toolName }}</dd>
        <dt>操作对象</dt><dd>{{ request.resource }}</dd>
      </dl>
      <div class="agent-permission__scope">
        <strong>本会话允许的范围<span v-if="request.action"> · {{ request.action }}</span></strong>
        <ul><li v-for="pattern in approvalScope" :key="pattern">{{ pattern }}</li></ul>
        <p v-if="approvalScope.includes('*')">* 表示此类操作的所有对象；明确禁止的操作仍会被阻止，项目外目录仍需单独授权。</p>
      </div>
      <details :key="request.id">
        <summary>查看完整参数</summary>
        <pre>{{ inputText }}</pre>
      </details>
      <p>“本会话允许”会记住当前角色的上述权限范围，并放行匹配的待确认操作；关闭会话后失效。拒绝会同时取消本会话其余待确认操作。</p>
      <p v-if="remaining > 1">还有 {{ remaining - 1 }} 项待确认。</p>
    </div>
    <span slot="footer">
      <el-button :disabled="busy" @click="deny">拒绝</el-button>
      <el-button :disabled="busy" @click="$emit('decide', 'allow_session')">本会话允许</el-button>
      <el-button type="primary" :disabled="busy" @click="$emit('decide', 'allow_once')">{{ busy ? '处理中…' : '本次允许' }}</el-button>
    </span>
  </el-dialog>
</template>

<script>
export default {
  name: 'AgentPermissionDialog',
  props: {
    request: { type: Object, required: true },
    busy: { type: Boolean, default: false },
    remaining: { type: Number, default: 1 },
    sessionTitle: { type: String, default: '' }
  },
  computed: {
    inputText() { return JSON.stringify(this.request.input, null, 2) },
    approvalScope() {
      return this.request.patterns && this.request.patterns.length ? this.request.patterns : [this.request.resource]
    }
  },
  methods: {
    deny() {
      if (!this.busy) this.$emit('decide', 'deny')
    }
  }
}
</script>

<style lang="scss">
.agent-permission-dialog {
  max-width: calc(100vw - 32px);
  .el-dialog__body {
    max-height: 60vh;
    overflow: auto;
    padding-top: 0;
    padding-bottom: 0;
  }
  .el-dialog__footer {
    display: flex;
    justify-content: flex-end;
    span { display: flex; flex-wrap: wrap; gap: 8px; }
    .el-button + .el-button { margin-left: 0; }
  }
}
.agent-permission {
  font-size: 12px;
  line-height: 1.7;
  overflow-wrap: anywhere;
  dt { color: #909399; }
  dd { margin: 4px 0 12px; white-space: pre-wrap; }
  dd, li, pre { font-family: Consolas, monospace; }
  summary { cursor: pointer; }
  pre { padding: 12px; background: #f7f8fa; white-space: pre-wrap; }
}
.agent-permission__scope {
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid #f1ddcb;
  border-radius: 8px;
  background: #fff9f3;
  li { white-space: pre-wrap; }
  p { color: #9b632c; }
}
</style>
