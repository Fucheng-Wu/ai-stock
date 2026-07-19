<template>
  <div class="app-container">
    <el-card class="search-card" shadow="always">
      <div class="search-header">
        <span class="search-title">520均线战法 AI 分析系统</span>
      </div>
      <div class="search-body">
        <el-input v-model="stockCode" placeholder="请输入股票代码，如 sh600519 或 600519" size="large"
          clearable @keyup.enter.native="handleAnalyze" class="stock-input">
          <template #prepend>股票代码</template>
          <template #append>
            <el-button type="primary" @click="handleAnalyze" :loading="loading" icon="el-icon-search">
              分析
            </el-button>
          </template>
        </el-input>
        <div class="search-hint">支持 sh/sz 前缀或自动识别（6开头=上海，0/3开头=深圳）</div>
      </div>
    </el-card>

    <el-alert v-if="errorMsg" :title="errorMsg" type="error" show-icon :closable="true"
      @close="errorMsg = ''" class="error-alert" />

    <div v-loading="loading" element-loading-text="正在分析中，请稍候..." class="loading-container">
      <template v-if="result && !loading">
        <el-card class="result-card stock-header-card" shadow="always">
          <div class="stock-header">
            <div class="stock-info">
              <span class="stock-name">{{ result.stock.name }}</span>
              <el-tag size="small" type="info" class="stock-code-tag">{{ result.stock.code }}</el-tag>
            </div>
            <div class="stock-price-section">
              <span class="current-price" :class="priceClass">{{ result.stock.currentPrice }}</span>
              <span class="price-unit">元</span>
              <span class="price-change" :class="priceClass">
                {{ result.stock.changeAmt > 0 ? '+' : '' }}{{ result.stock.changeAmt }}
              </span>
              <span class="price-change-pct" :class="priceClass">
                {{ result.stock.changePct > 0 ? '+' : '' }}{{ result.stock.changePct }}%
              </span>
              <el-tag :type="result.stock.changePct >= 0 ? 'danger' : 'success'" size="small" effect="dark" class="change-tag">
                {{ result.stock.changePct >= 0 ? '上涨' : '下跌' }}
              </el-tag>
            </div>
          </div>
          <div class="stock-time">{{ result.stock.date }} {{ result.stock.time }}</div>
        </el-card>

        <el-card class="result-card" shadow="always">
          <template #header><span class="card-title">实时行情</span></template>
          <el-row :gutter="16">
            <el-col :xs="12" :sm="8" :md="4" v-for="item in marketData" :key="item.label">
              <div class="stat-item">
                <div class="stat-label">{{ item.label }}</div>
                <div class="stat-value" :class="item.color">{{ item.value }}</div>
                <div class="stat-unit">{{ item.unit }}</div>
              </div>
            </el-col>
          </el-row>
        </el-card>

        <el-row :gutter="16" class="ma-signal-row">
          <el-col :xs="24" :md="12">
            <el-card class="result-card ma-card" shadow="always">
              <template #header><span class="card-title">均线数据</span></template>
              <div class="ma-grid">
                <div class="ma-item">
                  <div class="ma-label">MA5 (5日均线)</div>
                  <div class="ma-value">{{ result.stock.ma5 || '--' }}</div>
                  <div class="ma-prev">前日: {{ result.stock.ma5Prev || '--' }}</div>
                </div>
                <div class="ma-item">
                  <div class="ma-label">MA20 (20日均线)</div>
                  <div class="ma-value">{{ result.stock.ma20 || '--' }}</div>
                  <div class="ma-prev">前日: {{ result.stock.ma20Prev || '--' }}</div>
                </div>
                <div class="ma-item ma-trend-item">
                  <div class="ma-label">20日线趋势</div>
                  <div class="trend-indicator">
                    <span v-if="result.trend20ma === 'UP'" class="trend-up">↑ 多头</span>
                    <span v-else-if="result.trend20ma === 'DOWN'" class="trend-down">↓ 空头</span>
                    <span v-else class="trend-flat">→ 震荡</span>
                  </div>
                  <div class="ma-prev">{{ result.trendDesc }}</div>
                </div>
              </div>
            </el-card>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-card class="result-card signal-card" shadow="always">
              <template #header><span class="card-title">交易信号</span></template>
              <div class="signal-content">
                <div class="signal-type-row">
                  <span class="signal-badge" :class="signalBadgeClass">{{ signalBadgeText }}</span>
                  <span class="signal-desc">{{ result.signal.description }}</span>
                </div>
                <div class="signal-detail">
                  <div class="signal-field">
                    <span class="field-label">信号类型</span>
                    <span class="field-value">{{ result.signal.type }}</span>
                  </div>
                  <div class="signal-field">
                    <span class="field-label">置信度</span>
                    <span class="field-value" :class="confidenceClass">{{ result.signal.confidence }}</span>
                  </div>
                  <div class="signal-field">
                    <span class="field-label">建议仓位</span>
                    <span class="field-value position-value">{{ result.signal.suggestedPosition }}</span>
                  </div>
                </div>
                <div class="signal-reason">
                  <div class="reason-label">系统理由</div>
                  <div class="reason-text">{{ result.signal.reason }}</div>
                </div>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <el-card class="result-card ai-card" shadow="always">
          <template #header>
            <div class="ai-card-header">
              <span class="card-title">DeepSeek AI 分析报告</span>
              <el-tag :type="riskTagType" effect="dark" size="small" class="risk-tag">
                ⚠ 风险等级: {{ result.riskLevel }}
              </el-tag>
            </div>
          </template>
          <div class="ai-content">
            <div class="ai-advice-section">
              <div class="advice-label">AI 操作建议</div>
              <div class="advice-text" :class="adviceClass">{{ result.aiAdvice }}</div>
            </div>
            <el-divider />
            <div class="ai-reason-section">
              <div class="reason-label">AI 分析理由</div>
              <div class="ai-reason-text">{{ result.aiReason }}</div>
            </div>
          </div>
        </el-card>

        <el-card class="result-card rules-card" shadow="always">
          <template #header><span class="card-title">操作纪律提醒</span></template>
          <el-row :gutter="16">
            <el-col :xs="24" :sm="12" :md="8" v-for="rule in tradingRules" :key="rule.id">
              <div class="rule-item">
                <span class="rule-num">{{ rule.id }}</span>
                <span class="rule-text">{{ rule.text }}</span>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </template>
    </div>
  </div>
</template>

<script>
import { analyzeStock } from '@/api/stock/analyzer'

export default {
  name: 'StockAnalyzer',
  data() {
    return {
      stockCode: '',
      loading: false,
      errorMsg: '',
      result: null,
      marketData: [],
      tradingRules: [
        { id: 1, text: '20日线向下 → 坚决不进场，所有反弹都是陷阱' },
        { id: 2, text: '金叉进场 → 首次3成仓，绝不梭哈' },
        { id: 3, text: '跌破5日线止损 → 最大亏损控制在5%以内' },
        { id: 4, text: '跌破20日线 → 无条件清仓，趋势已坏' },
        { id: 5, text: '盈利3%-5% → 落袋为安，不贪心' },
        { id: 6, text: '永远保留5成以上现金，绝不满仓' }
      ]
    }
  },
  computed: {
    priceClass() {
      if (!this.result) return ''
      return this.result.stock.changePct >= 0 ? 'price-up' : 'price-down'
    },
    signalBadgeClass() {
      if (!this.result) return ''
      const map = {
        'GOLDEN_CROSS': 'badge-golden',
        'GOLDEN_CROSS_WEAK': 'badge-weak',
        'DEATH_CROSS': 'badge-death',
        'RETRACE': 'badge-retrace',
        'CONVERGENCE': 'badge-convergence',
        'NONE': 'badge-none'
      }
      return map[this.result.signal.type] || 'badge-none'
    },
    signalBadgeText() {
      if (!this.result) return ''
      const map = {
        'GOLDEN_CROSS': '金叉',
        'GOLDEN_CROSS_WEAK': '弱金叉',
        'DEATH_CROSS': '死叉',
        'RETRACE': '回踩',
        'CONVERGENCE': '粘合发散',
        'NONE': '无信号'
      }
      return map[this.result.signal.type] || '无信号'
    },
    confidenceClass() {
      if (!this.result) return ''
      if (this.result.signal.confidence === 'HIGH') return 'conf-high'
      if (this.result.signal.confidence === 'MEDIUM') return 'conf-medium'
      return 'conf-low'
    },
    riskTagType() {
      if (!this.result) return 'info'
      if (this.result.riskLevel === '低') return 'success'
      if (this.result.riskLevel === '中') return 'warning'
      if (this.result.riskLevel === '高') return 'danger'
      return 'info'
    },
    adviceClass() {
      if (!this.result) return ''
      const advice = this.result.aiAdvice || ''
      if (advice.includes('买入') || advice.includes('加仓')) return 'advice-buy'
      if (advice.includes('持有')) return 'advice-hold'
      if (advice.includes('观望')) return 'advice-watch'
      if (advice.includes('卖出') || advice.includes('止损') || advice.includes('清仓')) return 'advice-sell'
      return ''
    }
  },
  methods: {
    handleAnalyze() {
      const code = this.stockCode.trim()
      if (!code) {
        this.$message.warning('请输入股票代码')
        return
      }
      this.loading = true
      this.errorMsg = ''
      this.result = null
      analyzeStock({ stockCode: code }).then(res => {
        this.result = res.data
        this.buildMarketData()
      }).catch(err => {
        this.errorMsg = err.msg || '分析失败，请检查股票代码是否正确'
      }).finally(() => {
        this.loading = false
      })
    },
    buildMarketData() {
      if (!this.result) return
      const s = this.result.stock
      this.marketData = [
        { label: '开盘价', value: s.openPrice.toFixed(2), unit: '元', color: '' },
        { label: '昨收价', value: s.prevClose.toFixed(2), unit: '元', color: '' },
        { label: '最高价', value: s.high.toFixed(2), unit: '元', color: s.currentPrice >= s.prevClose ? 'price-up' : 'price-down' },
        { label: '最低价', value: s.low.toFixed(2), unit: '元', color: '' },
        { label: '成交量', value: this.formatVolume(s.volume), unit: '手', color: '' },
        { label: '成交额', value: this.formatAmount(s.amount), unit: '元', color: '' }
      ]
    },
    formatVolume(vol) {
      if (vol >= 10000) return (vol / 10000).toFixed(2) + '万'
      return vol.toLocaleString()
    },
    formatAmount(amt) {
      if (amt >= 100000000) return (amt / 100000000).toFixed(2) + '亿'
      if (amt >= 10000) return (amt / 10000).toFixed(2) + '万'
      return amt.toLocaleString()
    }
  }
}
</script>

<style scoped>
.app-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 16px;
}
.search-card {
  margin-bottom: 20px;
  border-radius: 8px;
}
.search-header {
  margin-bottom: 6px;
}
.search-title {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(135deg, #1890ff, #722ed1);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.search-body {
  display: flex;
  flex-direction: column;
}
.stock-input {
  max-width: 520px;
}
.search-hint {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
}
.error-alert {
  margin-bottom: 16px;
}
.loading-container {
  min-height: 200px;
}
.result-card {
  margin-bottom: 16px;
  border-radius: 8px;
}
.stock-header-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  border: none;
}
.stock-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.stock-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.stock-name {
  font-size: 28px;
  font-weight: 700;
}
.stock-code-tag {
  font-size: 14px;
}
.stock-price-section {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}
.current-price {
  font-size: 36px;
  font-weight: 700;
}
.price-unit {
  font-size: 14px;
  opacity: 0.8;
}
.price-change, .price-change-pct {
  font-size: 18px;
  font-weight: 600;
}
.change-tag {
  font-size: 14px;
  padding: 4px 10px;
}
.stock-time {
  font-size: 13px;
  opacity: 0.7;
  margin-top: 8px;
}
.card-title {
  font-size: 16px;
  font-weight: 600;
}
.stat-item {
  text-align: center;
  padding: 12px 8px;
  border-radius: 6px;
  background: #fafafa;
  transition: all 0.3s;
  margin-bottom: 12px;
}
.stat-item:hover {
  background: #f0f5ff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}
.stat-label {
  font-size: 13px;
  color: #888;
  margin-bottom: 4px;
}
.stat-value {
  font-size: 22px;
  font-weight: 700;
  color: #333;
}
.stat-unit {
  font-size: 11px;
  color: #aaa;
  margin-top: 2px;
}
.ma-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.ma-item {
  flex: 1;
  min-width: 180px;
  padding: 12px 16px;
  background: #fafafa;
  border-radius: 6px;
  text-align: center;
}
.ma-label {
  font-size: 13px;
  color: #888;
  margin-bottom: 6px;
}
.ma-value {
  font-size: 24px;
  font-weight: 700;
  color: #333;
}
.ma-prev {
  font-size: 12px;
  color: #aaa;
  margin-top: 4px;
}
.trend-up { color: #cf1322; font-weight: 700; font-size: 20px; }
.trend-down { color: #389e0d; font-weight: 700; font-size: 20px; }
.trend-flat { color: #8c8c8c; font-weight: 700; font-size: 20px; }
.signal-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.signal-type-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.signal-badge {
  display: inline-block;
  padding: 6px 18px;
  border-radius: 20px;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}
.badge-golden { background: #52c41a; }
.badge-weak { background: #faad14; }
.badge-death { background: #ff4d4f; }
.badge-retrace { background: #1890ff; }
.badge-convergence { background: #722ed1; }
.badge-none { background: #8c8c8c; }
.signal-desc {
  font-size: 16px;
  font-weight: 600;
  color: #333;
}
.signal-detail {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  padding: 8px 0;
}
.signal-field {
  display: flex;
  align-items: center;
  gap: 6px;
}
.field-label {
  font-size: 13px;
  color: #888;
}
.field-value {
  font-size: 14px;
  font-weight: 600;
}
.conf-high { color: #52c41a; }
.conf-medium { color: #faad14; }
.conf-low { color: #ff4d4f; }
.position-value {
  color: #1890ff;
}
.signal-reason {
  padding: 10px 14px;
  background: #fffbe6;
  border-left: 3px solid #faad14;
  border-radius: 4px;
}
.reason-label {
  font-size: 13px;
  color: #888;
  margin-bottom: 4px;
}
.reason-text, .ai-reason-text {
  font-size: 14px;
  line-height: 1.6;
  color: #555;
}
.ai-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.risk-tag {
  font-size: 14px;
  padding: 6px 14px;
}
.ai-content {
  padding: 8px 0;
}
.ai-advice-section {
  text-align: center;
  padding: 16px;
}
.advice-label {
  font-size: 14px;
  color: #888;
  margin-bottom: 8px;
}
.advice-text {
  font-size: 28px;
  font-weight: 700;
  padding: 8px 24px;
  display: inline-block;
  border-radius: 8px;
}
.advice-buy {
  color: #cf1322;
  background: #fff1f0;
}
.advice-hold {
  color: #1890ff;
  background: #e6f7ff;
}
.advice-watch {
  color: #faad14;
  background: #fffbe6;
}
.advice-sell {
  color: #389e0d;
  background: #f6ffed;
}
.ai-reason-section {
  padding: 8px 16px;
}
.rules-card {
  background: #fafafa;
}
.rule-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
  background: #fff;
  border-radius: 4px;
  border-left: 3px solid #1890ff;
  transition: all 0.2s;
}
.rule-item:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  transform: translateX(2px);
}
.rule-num {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  background: #1890ff;
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}
.rule-text {
  font-size: 13px;
  color: #555;
  line-height: 1.5;
}
.price-up { color: #cf1322 !important; }
.price-down { color: #389e0d !important; }
.ma-signal-row {
  margin-left: -8px;
  margin-right: -8px;
}
.ma-signal-row .el-col {
  padding-left: 8px;
  padding-right: 8px;
}
.el-divider--horizontal {
  margin: 16px 0;
}
</style>
