<template>
  <section class="strategy-report" data-testid="strategy-report">
    <el-alert
      v-if="!report"
      title="这是一份旧版分析，尚无结构化策略数据；请重新分析。"
      type="info"
      show-icon
      :closable="false"
    />
    <template v-else>
      <header class="strategy-report__header">
        <div>
          <div class="stock-page__eyebrow">520 策略分析</div>
          <h2 class="stock-card__title">数据先行的策略报告</h2>
        </div>
        <span class="stock-badge">规则引擎结论</span>
      </header>

      <rule-card step="第一步" :rule="report.trendStep" />

      <div v-if="trendIsUp" class="strategy-report__section" data-testid="buy-point-step">
        <h3>第二步：找买点</h3>
        <div class="strategy-report__grid">
          <rule-card v-for="rule in buyRules" :key="rule.code" :rule="rule" />
        </div>
      </div>

      <div v-if="holdingMode && exitRules.length" class="strategy-report__section strategy-report__exits" data-testid="exit-step">
        <h3>持仓专属：止损止盈</h3>
        <div class="strategy-report__grid">
          <rule-card v-for="rule in exitRules" :key="rule.code" :rule="rule" />
        </div>
      </div>

      <div v-if="holdingMode" class="strategy-report__section" data-testid="position-management-step">
        <h3>第三步：执行与仓位管理</h3>
        <rule-card :rule="report.positionStep" />
        <div class="strategy-report__summary"><strong>规则汇总：</strong>{{ report.summary || '--' }}</div>
      </div>

      <section class="stock-detail-panel strategy-report__ai">
        <div class="stock-section-title">
          <strong>DeepSeek 综合解读</strong>
          <div class="strategy-report__ai-actions">
            <el-tag :type="riskType" size="small" effect="plain">风险等级 · {{ result.riskLevel || '未知' }}</el-tag>
            <el-button
              type="primary"
              plain
              size="small"
              icon="el-icon-cpu"
              :loading="aiLoading"
              @click="$emit('ai-analyze')"
            >AI 分析</el-button>
          </div>
        </div>
        <div class="stock-report__advice">
          <span class="stock-report__icon"><i class="el-icon-cpu" /></span>
          <div>
            <div class="stock-report__label">AI 操作建议</div>
            <div class="stock-report__value">{{ result.aiAdvice || 'AI 综合解读暂不可用，规则报告仍可正常使用。' }}</div>
          </div>
        </div>
        <div class="stock-report__reason">{{ result.aiReason || '当前未返回 AI 理由，请以以上规则证据为准。' }}</div>
      </section>
    </template>
  </section>
</template>

<script>
const RuleCard = {
  functional: true,
  props: { rule: { type: Object, default: () => ({}) }, step: { type: String, default: '' } },
  render(h, context) {
    const rule = context.props.rule || {}
    const evidence = Array.isArray(rule.evidence) ? rule.evidence : []
    const statusLabels = { SATISFIED: '满足', NOT_SATISFIED: '未满足', SKIPPED: '已跳过', INSUFFICIENT: '数据不足' }
    return h('article', { class: ['strategy-rule', `strategy-rule--${String(rule.status || 'unknown').toLowerCase()}`] }, [
      h('div', { class: 'strategy-rule__title' }, [
        h('strong', `${context.props.step ? context.props.step + ' · ' : ''}${rule.name || '规则判断'}`),
        h('span', { class: 'strategy-rule__status' }, statusLabels[rule.status] || rule.status || '未知')
      ]),
      h('div', { class: 'strategy-rule__evidence', attrs: { 'data-testid': 'rule-evidence' } }, evidence.map(item =>
        h('div', { class: 'strategy-evidence' }, [
          h('div', { class: 'strategy-evidence__header' }, [
            h('span', { class: 'strategy-evidence__label' }, item.label || '--'),
            h('em', { class: `strategy-evidence--${String(item.status || '').toLowerCase()}` }, item.status || 'INSUFFICIENT')
          ]),
          h('strong', item.displayValue || '--'),
          h('small', item.threshold ? `条件：${item.threshold}` : '实际数据')
        ])
      )),
      h('div', { class: 'strategy-rule__conclusion' }, rule.conclusion || '--'),
      h('p', { class: 'strategy-rule__reason', attrs: { 'data-testid': 'rule-reason' } }, rule.reason || '--')
    ])
  }
}

export default {
  name: 'StockStrategyReport',
  components: { RuleCard },
  props: {
    result: { type: Object, default: () => ({}) },
    holdingMode: { type: Boolean, default: false },
    aiLoading: { type: Boolean, default: false }
  },
  computed: {
    report() { return this.result && this.result.strategyReport },
    trendIsUp() {
      return Boolean(this.report && this.report.trendStep && this.report.trendStep.conclusion === 'UP')
    },
    buyRules() {
      const step = this.report && this.report.buyPointStep
      return step ? [step.goldenCross, step.retrace, step.convergence].filter(Boolean) : []
    },
    exitRules() {
      const step = this.report && this.report.exitStep
      return step ? [step.shortStop, step.trendStop, step.regularTakeProfit, step.strongTakeProfit].filter(Boolean) : []
    },
    riskType() {
      return this.result.riskLevel === '低' ? 'success' : this.result.riskLevel === '高' ? 'danger' : this.result.riskLevel === '中' ? 'warning' : 'info'
    }
  }
}
</script>

<style lang="scss" scoped>
.strategy-report { margin-top: 16px; }
.strategy-report__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.strategy-report__section { margin-top: 14px; }
.strategy-report__section h3 { margin: 0 0 8px; font-size: 16px; }
.strategy-report__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; }
.strategy-rule { padding: 12px; border: 1px solid var(--stock-border); border-radius: 8px; background: #fff; }
.strategy-rule__title { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 9px; }
.strategy-rule__title strong { font-size: 15px; }
.strategy-rule__status { flex: none; color: #475569; font-size: 12px; font-weight: 700; }
.strategy-rule--satisfied .strategy-rule__status { color: #15803d; }
.strategy-rule--not_satisfied .strategy-rule__status { color: #b45309; }
.strategy-rule--skipped .strategy-rule__status, .strategy-rule--insufficient .strategy-rule__status { color: #64748b; }
.strategy-rule__evidence { display: flex; flex-wrap: wrap; align-items: stretch; gap: 6px; }
.strategy-evidence { display: flex; flex: 1 1 112px; flex-direction: column; gap: 2px; min-width: 112px; max-width: none; padding: 6px 8px; border-radius: 6px; background: #f8fafc; }
.strategy-evidence__header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.strategy-evidence__label, .strategy-evidence small { color: #64748b; font-size: 12px; line-height: 1.45; }
.strategy-evidence strong { font-size: 16px; line-height: 1.4; }
.strategy-evidence em { flex: none; font-size: 11px; font-style: normal; }
.strategy-evidence--pass { color: #15803d; }
.strategy-evidence--fail { color: #b45309; }
.strategy-evidence--insufficient { color: #64748b; }
.strategy-rule__conclusion { margin-top: 9px; font-size: 14px; font-weight: 700; }
.strategy-rule__reason { margin: 4px 0 0; color: #475569; font-size: 13px; line-height: 1.55; }
.strategy-report__summary { margin-top: 8px; padding: 9px 10px; border-radius: 7px; background: #eff6ff; color: #1e3a8a; font-size: 13px; }
.strategy-report__ai { margin-top: 14px; }
.strategy-report__ai-actions { display: flex; align-items: center; gap: 8px; }
@media (max-width: 600px) {
  .strategy-report__grid { grid-template-columns: 1fr; }
  .strategy-evidence { min-width: calc(50% - 3px); }
}
</style>
