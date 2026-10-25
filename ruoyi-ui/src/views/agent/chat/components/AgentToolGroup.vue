<template>
  <div class="agent-tool-group">
    <button class="agent-tool-group__toggle" type="button" :aria-expanded="open" @click="toggle"><i class="el-icon-setting" /> 工具执行过程 <small>{{ tools.length }} 项<span v-if="running"> · {{ running }} 项执行中</span><span v-if="failed"> · {{ failed }} 项失败</span></small><i :class="open ? 'el-icon-arrow-up' : 'el-icon-arrow-down'" /></button>
    <div v-show="open"><agent-tool-card v-for="tool in tools" :key="tool.id" :tool="tool" :now="now" @subagent="$emit('subagent', $event)" @layout="$emit('layout')" /></div>
  </div>
</template>
<script>
import AgentToolCard from './AgentToolCard.vue'
export default {
  name: 'AgentToolGroup',
  components: { AgentToolCard },
  props: { tools: { type: Array, required: true }, now: Number },
  data() { return { open: true } },
  computed: {
    running() { return this.tools.filter(tool => tool.status === 'running').length },
    failed() { return this.tools.filter(tool => tool.status === 'error').length }
  },
  methods: { toggle() { this.open = !this.open; this.$nextTick(() => this.$emit('layout')) } }
}
</script>
<style scoped>
.agent-tool-group { margin: 12px 0; }
.agent-tool-group__toggle { display: flex; width: 100%; align-items: center; gap: 8px; padding: 9px 0; border: 0; background: transparent; color: var(--agent-text, var(--agent-text, #374151)); font: inherit; font-size: 12px; cursor: pointer; }
.agent-tool-group__toggle small { color: var(--agent-muted, var(--agent-muted, #6b7280)); font-size: 11px; }
.agent-tool-group__toggle > i:last-child { margin-left: auto; }
</style>
