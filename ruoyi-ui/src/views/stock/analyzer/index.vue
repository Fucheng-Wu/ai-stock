<template>
  <div class="stock-page analyzer-page">
    <header class="stock-page__header">
      <div>
        <div class="stock-page__eyebrow">520 均线策略</div>
        <h1 class="stock-page__title">AI 股票分析</h1>
        <p class="stock-page__subtitle">结合均线趋势、交易信号与 AI 建议，快速生成结构化决策参考</p>
      </div>
      <div class="stock-toolbar analyzer-search">
        <el-input
          v-model="stockCode"
          clearable
          prefix-icon="el-icon-search"
          placeholder="输入 600519 或 sh600519"
          @keyup.enter.native="handleAnalyze"
        />
        <el-button type="primary" :loading="loading" @click="handleAnalyze">
          {{ loading ? '分析中' : '开始分析' }}
        </el-button>
      </div>
    </header>

    <el-alert
      v-if="errorMsg"
      class="analyzer-alert"
      :title="errorMsg"
      type="error"
      show-icon
      closable
      @close="errorMsg = ''"
    />

    <main v-loading="loading" element-loading-text="正在获取行情并计算均线，请稍候…" class="analyzer-content">
      <template v-if="result && result.stock && !loading">
        <el-card class="stock-card quote-card" shadow="never">
          <div class="stock-quote">
            <div class="stock-quote__main">
              <div class="stock-identity">
                <span class="stock-identity__avatar">{{ stockInitial }}</span>
                <div>
                  <span class="stock-identity__name quote-name">{{ stock.name || '未命名股票' }}</span>
                  <span class="stock-identity__code">{{ stock.code || stockCode }}</span>
                </div>
                <span class="stock-badge" :class="changeBadgeClass">
                  <i :class="priceChange >= 0 ? 'el-icon-top' : 'el-icon-bottom'" />
                  {{ priceChange >= 0 ? '上涨' : '下跌' }}
                </span>
              </div>
              <div class="stock-quote__price stock-number" :class="priceClass">
                {{ formatNumber(stock.currentPrice) }}
                <small>元</small>
              </div>
              <div class="stock-quote__change stock-number" :class="priceClass">
                {{ signed(stock.changeAmt) }} &nbsp; {{ signed(stock.changePct) }}%
              </div>
            </div>
            <div class="stock-quote__time">
              <i class="el-icon-time" />
              行情时间 {{ stock.date || '--' }} {{ stock.time || '--' }}
            </div>
          </div>
        </el-card>

        <el-card class="stock-card" shadow="never">
          <div slot="header" class="stock-card__header">
            <div>
              <h2 class="stock-card__title">实时行情</h2>
              <p class="stock-card__description">关键价格与成交数据</p>
            </div>
            <span class="stock-badge">数据快照</span>
          </div>
          <div class="stock-metric-grid">
            <div v-for="item in marketData" :key="item.label" class="stock-metric">
              <div class="stock-metric__label">{{ item.label }}</div>
              <div class="stock-metric__value stock-number" :class="item.color">{{ item.value }}</div>
              <div class="stock-metric__hint">{{ item.unit }}</div>
            </div>
          </div>
        </el-card>

        <div class="stock-detail-grid analyzer-strategy-grid">
          <el-card class="stock-card strategy-card" shadow="never">
            <div slot="header" class="stock-card__header">
              <div>
                <h2 class="stock-card__title">均线趋势</h2>
                <p class="stock-card__description">MA5 与 MA20 趋势结构</p>
              </div>
              <span class="stock-badge" :class="trendBadgeClass">{{ trendLabel }}</span>
            </div>
            <div class="moving-average-grid">
              <div class="moving-average-item">
                <span>MA5</span>
                <strong class="stock-number">{{ formatNumber(stock.ma5) }}</strong>
                <small>前一日 {{ formatNumber(stock.ma5Prev) }}</small>
              </div>
              <div class="moving-average-item">
                <span>MA20</span>
                <strong class="stock-number">{{ formatNumber(stock.ma20) }}</strong>
                <small>前一日 {{ formatNumber(stock.ma20Prev) }}</small>
              </div>
            </div>
            <div class="trend-summary">
              <i :class="trendIcon" />
              <div>
                <strong>{{ result.trendDesc || '趋势数据暂不可用' }}</strong>
                <span>20 日均线趋势判断</span>
              </div>
            </div>
          </el-card>

          <el-card class="stock-card strategy-card" shadow="never">
            <div slot="header" class="stock-card__header">
              <div>
                <h2 class="stock-card__title">交易信号</h2>
                <p class="stock-card__description">策略信号与系统仓位建议</p>
              </div>
              <span class="stock-badge" :class="signalBadgeClass">{{ signalBadgeText }}</span>
            </div>
            <div class="signal-headline">{{ signal.description || '当前未形成明确交易信号' }}</div>
            <div class="stock-field-grid">
              <div class="stock-field">
                <span class="stock-field__label">信号类型</span>
                <strong class="stock-field__value">{{ signal.type || '--' }}</strong>
              </div>
              <div class="stock-field">
                <span class="stock-field__label">置信度</span>
                <strong class="stock-field__value">{{ confidenceLabel }}</strong>
              </div>
              <div class="stock-field">
                <span class="stock-field__label">建议仓位</span>
                <strong class="stock-field__value primary-text">{{ signal.suggestedPosition || '--' }}</strong>
              </div>
            </div>
            <div class="stock-callout">
              <strong>系统判断：</strong>{{ signal.reason || '暂无进一步说明' }}
            </div>
          </el-card>
        </div>

        <el-card class="stock-card ai-report-card" shadow="never">
          <div slot="header" class="stock-card__header">
            <div>
              <h2 class="stock-card__title">DeepSeek AI 分析报告</h2>
              <p class="stock-card__description">基于技术指标生成的辅助分析，不构成投资建议</p>
            </div>
            <el-tag :type="riskTagType" size="small" effect="plain">风险等级 · {{ result.riskLevel || '未知' }}</el-tag>
          </div>
          <div class="stock-report">
            <div class="stock-report__advice">
              <span class="stock-report__icon"><i class="el-icon-cpu" /></span>
              <div>
                <div class="stock-report__label">AI 操作建议</div>
                <div class="stock-report__value" :class="adviceClass">{{ result.aiAdvice || 'AI 分析暂不可用' }}</div>
              </div>
            </div>
            <div class="stock-report__reason">{{ result.aiReason || '当前未返回 AI 分析理由，可先参考均线趋势与交易信号。' }}</div>
          </div>
        </el-card>

        <el-card class="stock-card stock-card--flat" shadow="never">
          <div slot="header" class="stock-card__header">
            <div>
              <h2 class="stock-card__title">操作纪律</h2>
              <p class="stock-card__description">遵守策略边界，比预测行情更重要</p>
            </div>
            <i class="el-icon-lock discipline-icon" />
          </div>
          <ol class="stock-rule-list">
            <li v-for="rule in tradingRules" :key="rule.id" class="stock-rule">
              <span class="stock-rule__index">{{ String(rule.id).padStart(2, '0') }}</span>
              <span>{{ rule.text }}</span>
            </li>
          </ol>
        </el-card>
      </template>

      <el-card v-else-if="!loading" class="stock-card empty-card" shadow="never">
        <div class="stock-empty">
          <i class="el-icon-data-analysis stock-empty__icon" />
          <div class="stock-empty__title">输入股票代码，生成分析报告</div>
          <p class="stock-empty__description">
            支持 sh/sz 前缀或 6 位代码。系统将计算 MA5、MA20、交易信号并生成 AI 辅助建议。
          </p>
          <el-button type="primary" plain class="empty-action" @click="focusSearch">试试 600519</el-button>
        </div>
      </el-card>
    </main>
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
        { id: 1, text: '20 日线向下时坚决不进场，所有反弹都需要保持谨慎。' },
        { id: 2, text: '金叉进场首次使用三成仓位，不因短线波动追高。' },
        { id: 3, text: '跌破 5 日线及时止损，将单次亏损控制在 5% 以内。' },
        { id: 4, text: '跌破 20 日线无条件清仓，趋势破坏后等待重新确认。' },
        { id: 5, text: '盈利达到 3%–5% 时分批落袋，不让盈利转为亏损。' },
        { id: 6, text: '始终保留五成以上现金，不满仓、不押注单一机会。' }
      ]
    }
  },
  computed: {
    stock() {
      return (this.result && this.result.stock) || {}
    },
    signal() {
      return (this.result && this.result.signal) || {}
    },
    stockInitial() {
      const text = this.stock.name || this.stock.code || '股'
      return text.slice(0, 1).toUpperCase()
    },
    priceChange() {
      const value = Number(this.stock.changePct)
      return Number.isFinite(value) ? value : 0
    },
    priceClass() {
      return this.priceChange >= 0 ? 'stock-up' : 'stock-down'
    },
    changeBadgeClass() {
      return this.priceChange >= 0 ? 'stock-badge--up' : 'stock-badge--down'
    },
    trendLabel() {
      const labels = { UP: '多头趋势', DOWN: '空头趋势', FLAT: '震荡整理' }
      return labels[this.result && this.result.trend20ma] || '趋势未知'
    },
    trendBadgeClass() {
      if (!this.result) return ''
      if (this.result.trend20ma === 'UP') return 'stock-badge--up'
      if (this.result.trend20ma === 'DOWN') return 'stock-badge--down'
      return 'stock-badge--warning'
    },
    trendIcon() {
      if (!this.result) return 'el-icon-minus'
      if (this.result.trend20ma === 'UP') return 'el-icon-top stock-up'
      if (this.result.trend20ma === 'DOWN') return 'el-icon-bottom stock-down'
      return 'el-icon-minus'
    },
    signalBadgeClass() {
      const map = {
        GOLDEN_CROSS: 'stock-badge--up',
        GOLDEN_CROSS_WEAK: 'stock-badge--warning',
        DEATH_CROSS: 'stock-badge--down',
        RETRACE: 'stock-badge--primary',
        CONVERGENCE: 'stock-badge--primary'
      }
      return map[this.signal.type] || ''
    },
    signalBadgeText() {
      const map = {
        GOLDEN_CROSS: '金叉',
        GOLDEN_CROSS_WEAK: '弱金叉',
        DEATH_CROSS: '死叉',
        RETRACE: '回踩',
        CONVERGENCE: '粘合发散',
        NONE: '暂无信号'
      }
      return map[this.signal.type] || '暂无信号'
    },
    confidenceLabel() {
      const map = { HIGH: '高', MEDIUM: '中', LOW: '低' }
      return map[this.signal.confidence] || this.signal.confidence || '--'
    },
    riskTagType() {
      if (!this.result) return 'info'
      if (this.result.riskLevel === '低') return 'success'
      if (this.result.riskLevel === '中') return 'warning'
      if (this.result.riskLevel === '高') return 'danger'
      return 'info'
    },
    adviceClass() {
      const advice = (this.result && this.result.aiAdvice) || ''
      if (advice.includes('买入') || advice.includes('加仓')) return 'stock-up'
      if (advice.includes('卖出') || advice.includes('止损') || advice.includes('清仓')) return 'stock-down'
      return ''
    }
  },
  created() {
    const stockCode = this.$route.query.stockCode
    if (typeof stockCode === 'string' && stockCode.trim()) {
      this.stockCode = stockCode.trim()
      this.handleAnalyze()
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
        this.errorMsg = err.msg || '分析失败，请检查股票代码是否正确后重试'
      }).finally(() => {
        this.loading = false
      })
    },
    buildMarketData() {
      if (!this.result || !this.result.stock) {
        this.marketData = []
        return
      }
      const stock = this.result.stock
      const highClass = Number(stock.high) >= Number(stock.prevClose) ? 'stock-up' : 'stock-down'
      const lowClass = Number(stock.low) >= Number(stock.prevClose) ? 'stock-up' : 'stock-down'
      this.marketData = [
        { label: '开盘价', value: this.formatNumber(stock.openPrice), unit: '人民币 / 元', color: '' },
        { label: '昨收价', value: this.formatNumber(stock.prevClose), unit: '人民币 / 元', color: '' },
        { label: '最高价', value: this.formatNumber(stock.high), unit: '今日最高', color: highClass },
        { label: '最低价', value: this.formatNumber(stock.low), unit: '今日最低', color: lowClass },
        { label: '成交量', value: this.formatVolume(stock.volume), unit: '成交手数', color: '' },
        { label: '成交额', value: this.formatAmount(stock.amount), unit: '人民币', color: '' }
      ]
    },
    formatNumber(value, digits = 2) {
      if (value === null || value === undefined || value === '') return '--'
      const number = Number(value)
      return Number.isFinite(number) ? number.toFixed(digits) : '--'
    },
    signed(value) {
      if (value === null || value === undefined || value === '') return '--'
      const number = Number(value)
      if (!Number.isFinite(number)) return '--'
      return `${number > 0 ? '+' : ''}${number.toFixed(2)}`
    },
    formatVolume(value) {
      if (value === null || value === undefined || value === '') return '--'
      const number = Number(value)
      if (!Number.isFinite(number)) return '--'
      if (number >= 100000000) return `${(number / 100000000).toFixed(2)} 亿`
      if (number >= 10000) return `${(number / 10000).toFixed(2)} 万`
      return number.toLocaleString()
    },
    formatAmount(value) {
      if (value === null || value === undefined || value === '') return '--'
      const number = Number(value)
      if (!Number.isFinite(number)) return '--'
      if (number >= 100000000) return `${(number / 100000000).toFixed(2)} 亿`
      if (number >= 10000) return `${(number / 10000).toFixed(2)} 万`
      return number.toLocaleString()
    },
    focusSearch() {
      this.stockCode = '600519'
    }
  }
}
</script>

<style lang="scss">
@import "~@/assets/styles/stock-management.scss";
</style>

<style lang="scss" scoped>
.analyzer-search {
  flex-wrap: nowrap;
  width: min(100%, 520px);

  .el-input {
    flex: 1;
  }
}

.analyzer-alert {
  margin-bottom: 16px;
  border-radius: 8px;
}

.analyzer-content {
  min-height: 280px;
}

.quote-card {
  border-top: 3px solid var(--stock-primary);
}

.quote-name {
  font-size: 17px;
}

.stock-quote__price small {
  color: var(--stock-muted);
  font-size: 13px;
  font-weight: 400;
}

.moving-average-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.moving-average-item {
  padding: 16px;
  border-radius: 8px;
  background: #f8fafc;

  span,
  small {
    display: block;
    color: var(--stock-muted);
    font-size: 12px;
  }

  strong {
    display: block;
    margin: 8px 0 5px;
    color: var(--stock-text);
    font-size: 24px;
  }
}

.trend-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--stock-border);

  > i {
    font-size: 22px;
  }

  strong,
  span {
    display: block;
  }

  strong {
    color: var(--stock-text);
    font-size: 14px;
  }

  span {
    margin-top: 4px;
    color: var(--stock-muted);
    font-size: 12px;
  }
}

.signal-headline {
  margin-bottom: 10px;
  color: var(--stock-text);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.6;
}

.primary-text {
  color: var(--stock-primary);
}

.discipline-icon {
  color: var(--stock-primary);
  font-size: 20px;
}

.empty-card {
  min-height: 320px;
}

.empty-action {
  margin-top: 18px;
}

@media (max-width: 768px) {
  .analyzer-search {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .analyzer-search {
    flex-direction: column;
  }

  .moving-average-grid {
    grid-template-columns: 1fr;
  }
}
</style>
