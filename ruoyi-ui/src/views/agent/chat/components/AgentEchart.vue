<template>
  <section class="agent-chart-card">
    <header class="agent-chart-card__header">
      <span class="agent-chart-card__label"><i class="el-icon-data-line" /> 图表</span>
      <div class="agent-chart-card__tabs" role="tablist" aria-label="图表展示方式">
        <button type="button" role="tab" :aria-selected="view === 'chart' ? 'true' : 'false'" :class="{ 'is-active': view === 'chart' }" @click="view = 'chart'">预览</button>
        <button type="button" role="tab" :aria-selected="view === 'code' ? 'true' : 'false'" :class="{ 'is-active': view === 'code' }" @click="view = 'code'">配置</button>
      </div>
      <button class="agent-chart-card__download" type="button" :disabled="!ready || pending || !!error" @click="downloadChart">
        <i class="el-icon-download" /> 下载图片
      </button>
    </header>
    <div v-if="view === 'chart' && pending" class="agent-chart-card__placeholder" aria-live="polite">
      <i class="el-icon-loading" /><span>正在生成图表…</span>
    </div>
    <div v-if="view === 'chart' && error" class="agent-chart-card__error" role="status">
      <i class="el-icon-warning-outline" /> {{ error }}，已保留原始配置。
    </div>
    <div v-show="view === 'chart' && !pending && !error" ref="canvas" class="agent-chart-card__canvas" role="img" aria-label="AI 回复中的交互图表" />
    <agent-code-block v-if="view === 'code' || (view === 'chart' && error)" :source="source" language="json" />
  </section>
</template>

<script>
import * as echarts from 'echarts'
import { parseAgentChart } from '@/utils/agent-echarts'
import AgentCodeBlock from './AgentCodeBlock.vue'

export default {
  name: 'AgentEchart',
  components: { AgentCodeBlock },
  props: {
    source: { type: String, default: '' },
    pending: { type: Boolean, default: false }
  },
  data() {
    return { view: 'chart', error: '', ready: false }
  },
  watch: {
    source: 'scheduleRender',
    pending: 'scheduleRender',
    view(value) {
      if (value === 'chart') this.scheduleRender()
      this.$nextTick(() => this.$emit('layout'))
    }
  },
  created() {
    // ECharts instances must stay outside Vue 2's recursive reactive observation.
    this.chartInstance = null
    this.resizeObserver = null
    this.renderTimer = null
    this.disposed = false
  },
  mounted() {
    if (window.ResizeObserver) {
      this.resizeObserver = new window.ResizeObserver(this.handleResize)
      this.resizeObserver.observe(this.$el)
    } else {
      window.addEventListener('resize', this.handleResize)
    }
    this.scheduleRender()
  },
  beforeDestroy() {
    this.disposed = true
    clearTimeout(this.renderTimer)
    if (this.resizeObserver) this.resizeObserver.disconnect()
    window.removeEventListener('resize', this.handleResize)
    if (this.chartInstance) this.chartInstance.dispose()
    this.chartInstance = null
  },
  methods: {
    scheduleRender() {
      clearTimeout(this.renderTimer)
      this.error = ''
      this.ready = false
      if (this.disposed || this.pending || this.view !== 'chart') return
      this.renderTimer = setTimeout(() => this.renderChart(), 60)
    },
    async renderChart() {
      if (this.disposed || this.pending || this.view !== 'chart') return
      try {
        const source = this.source
        const option = parseAgentChart(source)
        await this.$nextTick()
        if (this.disposed || this.pending || this.view !== 'chart' || source !== this.source || !this.$refs.canvas) return
        if (!this.chartInstance) this.chartInstance = echarts.init(this.$refs.canvas)
        this.chartInstance.setOption(option, true)
        this.chartInstance.resize()
        this.ready = true
      } catch (error) {
        if (this.disposed) return
        this.error = error.message || '暂时无法显示图表'
        if (this.chartInstance) this.chartInstance.clear()
      }
      if (!this.disposed) this.$nextTick(() => this.$emit('layout'))
    },
    handleResize() {
      if (this.chartInstance && !this.disposed && this.view === 'chart' && !this.pending && !this.error) {
        this.chartInstance.resize()
      }
    },
    downloadChart() {
      if (!this.chartInstance || !this.ready) return
      try {
        const link = document.createElement('a')
        link.href = this.chartInstance.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff', excludeComponents: ['toolbox'] })
        link.download = `agent-chart-${Date.now()}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } catch (error) {
        this.$message.warning('图表图片暂时无法下载')
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.agent-chart-card {
  min-width: 0;
  margin: 18px 0;
  overflow: hidden;
  border: 1px solid #e2e5ea;
  border-radius: 14px;
  background: #fff;
}
.agent-chart-card__header {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid #edf0f3;
  color: #767e89;
  font-size: 11px;
}
.agent-chart-card__label { display: flex; align-items: center; gap: 6px; }
.agent-chart-card__tabs {
  display: flex;
  gap: 3px;
  padding: 3px;
  border-radius: 7px;
  background: #f3f4f6;
  button {
    padding: 4px 11px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: #818791;
    font-size: 11px;
    cursor: pointer;
    &.is-active { background: #fff; color: #343b45; box-shadow: 0 1px 3px #0000000d; }
  }
}
.agent-chart-card__download {
  margin-left: auto;
  padding: 4px 0;
  border: 0;
  background: transparent;
  color: #737d89;
  font-size: 11px;
  cursor: pointer;
  &:disabled { opacity: 0.4; cursor: default; }
}
.agent-chart-card__canvas { width: 100%; height: 380px; }
.agent-chart-card__placeholder {
  display: flex;
  min-height: 240px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #939aa3;
  font-size: 13px;
}
.agent-chart-card__error { padding: 16px; color: #a36c37; font-size: 12px; }
.agent-chart-card ::v-deep .agent-code-block { margin: 0; border: 0; border-radius: 0; }
@media (max-width: 600px) {
  .agent-chart-card__canvas { height: 300px; }
  .agent-chart-card__header { gap: 8px; padding: 8px 10px; }
}
</style>
