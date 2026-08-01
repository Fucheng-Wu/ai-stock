<template>
  <section class="stock-analysis-overview">
    <div class="stock-detail-panel stock-analysis-overview__quote">
      <div class="stock-identity">
        <span class="stock-identity__avatar">{{ stockInitial }}</span>
        <div>
          <span class="stock-identity__name stock-analysis-overview__name">{{ stock.name || '未命名股票' }}</span>
          <span class="stock-identity__code">{{ stock.code || '--' }}</span>
        </div>
      </div>
      <div class="stock-analysis-overview__price">
        <strong class="stock-number" :class="changeClass">{{ formatNumber(stock.currentPrice) }}</strong>
        <span class="stock-number" :class="changeClass">{{ signed(stock.changePct) }}%</span>
      </div>
    </div>

    <div class="stock-analysis-overview__grid">
      <stock-kline-chart
        :kline-data="result.klineData || []"
        :updated-at="updatedAt"
      />

      <div class="stock-analysis-overview__side">
        <el-card class="stock-card stock-analysis-overview__basics" shadow="never">
          <div slot="header" class="stock-card__header stock-analysis-overview__section-header">
            <div>
              <h2 class="stock-card__title">股票基础信息</h2>
              <p class="stock-card__description">当日价格与成交数据</p>
            </div>
            <span class="stock-badge">行情快照</span>
          </div>
          <div class="stock-analysis-overview__metrics">
            <div v-for="item in marketItems" :key="item.label" class="stock-metric stock-analysis-overview__metric">
              <div class="stock-metric__label">{{ item.label }}</div>
              <div class="stock-metric__value stock-number" :class="item.className">{{ item.value }}</div>
              <div class="stock-metric__hint">{{ item.hint }}</div>
            </div>
          </div>
        </el-card>

        <section class="stock-detail-panel stock-analysis-overview__strategy">
          <div class="stock-section-title">
            <strong>均线趋势</strong>
            <span class="stock-badge" :class="trendBadgeClass">{{ trendLabel }}</span>
          </div>
          <div class="stock-field-grid stock-analysis-overview__fields">
            <div class="stock-field">
              <span class="stock-field__label">MA5</span>
              <strong class="stock-field__value stock-number">{{ formatNumber(stock.ma5) }}</strong>
            </div>
            <div class="stock-field">
              <span class="stock-field__label">MA20</span>
              <strong class="stock-field__value stock-number">{{ formatNumber(stock.ma20) }}</strong>
            </div>
            <div class="stock-field">
              <span class="stock-field__label">趋势判断</span>
              <strong class="stock-field__value">{{ result.trendDesc || '--' }}</strong>
            </div>
          </div>
        </section>

        <section class="stock-detail-panel stock-analysis-overview__strategy">
          <div class="stock-section-title">
            <strong>交易信号</strong>
            <span class="stock-badge" :class="signalBadgeClass">{{ signalLabel }}</span>
          </div>
          <div class="stock-analysis-overview__signal-description">{{ signal.description || '当前未形成明确交易信号' }}</div>
          <div class="stock-inline-meta stock-analysis-overview__signal-meta">
            <span>置信度 <strong>{{ confidenceLabel }}</strong></span>
            <span>建议仓位 <strong class="stock-analysis-overview__primary">{{ signal.suggestedPosition || '--' }}</strong></span>
          </div>
          <div class="stock-callout stock-analysis-overview__callout">{{ signal.reason || '暂无进一步说明' }}</div>
        </section>
      </div>
    </div>
  </section>
</template>

<script>
import StockKlineChart from '@/views/stock/analyzer/components/StockKlineChart.vue'

export default {
  name: 'StockAnalysisOverview',
  components: { StockKlineChart },
  props: {
    result: {
      type: Object,
      default: () => ({})
    },
    updatedAt: {
      type: String,
      default: ''
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
    changeClass() {
      return Number(this.stock.changePct) >= 0 ? 'stock-up' : 'stock-down'
    },
    trendLabel() {
      return { UP: '多头趋势', DOWN: '空头趋势', FLAT: '震荡整理' }[this.result.trend20ma] || '趋势未知'
    },
    trendBadgeClass() {
      if (this.result.trend20ma === 'UP') return 'stock-badge--up'
      if (this.result.trend20ma === 'DOWN') return 'stock-badge--down'
      return 'stock-badge--warning'
    },
    signalLabel() {
      const labels = {
        GOLDEN_CROSS: '金叉',
        GOLDEN_CROSS_WEAK: '弱金叉',
        DEATH_CROSS: '死叉',
        RETRACE: '回踩',
        CONVERGENCE: '粘合发散',
        NONE: '暂无信号'
      }
      return labels[this.signal.type] || '暂无信号'
    },
    signalBadgeClass() {
      const classes = {
        GOLDEN_CROSS: 'stock-badge--up',
        GOLDEN_CROSS_WEAK: 'stock-badge--warning',
        DEATH_CROSS: 'stock-badge--down',
        RETRACE: 'stock-badge--primary',
        CONVERGENCE: 'stock-badge--primary'
      }
      return classes[this.signal.type] || ''
    },
    confidenceLabel() {
      return { HIGH: '高', MEDIUM: '中', LOW: '低' }[this.signal.confidence] || this.signal.confidence || '--'
    },
    marketItems() {
      return [
        { label: '开盘价', value: this.formatNumber(this.stock.openPrice), hint: '人民币 / 元', className: '' },
        { label: '昨收价', value: this.formatNumber(this.stock.prevClose), hint: '人民币 / 元', className: '' },
        { label: '最高价', value: this.formatNumber(this.stock.high), hint: '今日最高', className: this.relativeClass(this.stock.high) },
        { label: '最低价', value: this.formatNumber(this.stock.low), hint: '今日最低', className: this.relativeClass(this.stock.low) },
        { label: '成交量', value: this.formatCompact(this.stock.volume), hint: '成交手数', className: '' },
        { label: '成交额', value: this.formatCompact(this.stock.amount), hint: '人民币', className: '' }
      ]
    }
  },
  methods: {
    formatNumber(value) {
      if (value === null || value === undefined || value === '') return '--'
      const number = Number(value)
      return Number.isFinite(number) ? number.toFixed(2) : '--'
    },
    formatCompact(value) {
      if (value === null || value === undefined || value === '') return '--'
      const number = Number(value)
      if (!Number.isFinite(number)) return '--'
      if (number >= 100000000) return `${(number / 100000000).toFixed(2)} 亿`
      if (number >= 10000) return `${(number / 10000).toFixed(2)} 万`
      return number.toLocaleString()
    },
    signed(value) {
      if (value === null || value === undefined || value === '') return '--'
      const number = Number(value)
      if (!Number.isFinite(number)) return '--'
      return `${number > 0 ? '+' : ''}${number.toFixed(2)}`
    },
    relativeClass(value) {
      const current = Number(value)
      const previousClose = Number(this.stock.prevClose)
      if (!Number.isFinite(current) || !Number.isFinite(previousClose)) return ''
      return current >= previousClose ? 'stock-up' : 'stock-down'
    }
  }
}
</script>

<style lang="scss" scoped>
.stock-analysis-overview {
  margin-bottom: 16px;
}

.stock-analysis-overview__quote {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 16px;
  border-top: 3px solid var(--stock-primary);
}

.stock-analysis-overview__name {
  font-size: 17px;
}

.stock-analysis-overview__price {
  display: flex;
  align-items: baseline;
  gap: 12px;

  strong {
    font-size: 28px;
  }

  span {
    font-size: 15px;
    font-weight: 600;
  }
}

.stock-analysis-overview__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 16px;

  > * {
    min-width: 0;
    margin-bottom: 0;
  }
}

.stock-analysis-overview__basics {
  display: flex;
  flex-direction: column;
  margin-bottom: 0;

  ::v-deep .el-card__header {
    padding: 11px 12px;
  }

  ::v-deep .el-card__body {
    flex: 1;
    padding: 10px 12px 12px;
    overflow-x: auto;
  }
}

.stock-analysis-overview__side {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
}

.stock-analysis-overview__section-header {
  .stock-card__description {
    margin-top: 2px;
  }
}

.stock-analysis-overview__metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
  width: 100%;
}

.stock-analysis-overview__metric {
  width: 100%;
  min-width: 0;
  min-height: 78px;
  padding: 8px 7px;

  .stock-metric__value {
    margin-top: 4px;
    font-size: 15px;
  }

  .stock-metric__hint {
    margin-top: 3px;
    font-size: 10px;
    white-space: nowrap;
  }
}

.stock-analysis-overview__strategy {
  padding: 13px 14px;
}

.stock-analysis-overview__fields {
  gap: 8px;

  .stock-field {
    padding: 8px 0 5px;
  }
}

.stock-analysis-overview__signal-description {
  margin-top: 8px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.45;
}

.stock-analysis-overview__signal-meta {
  margin-top: 7px;
}

.stock-analysis-overview__primary {
  color: var(--stock-primary);
}

.stock-analysis-overview__callout {
  margin-top: 8px;
  padding: 8px 10px;
  line-height: 1.5;
}

@media (min-width: 1201px) {
  .stock-analysis-overview__side {
    display: grid;
    grid-template-rows: repeat(3, minmax(0, 1fr));
    align-self: stretch;
    height: auto;
  }

  .stock-analysis-overview__basics,
  .stock-analysis-overview__strategy {
    height: 100%;
    min-height: 0;
    margin: 0;
  }
}

@media (max-width: 1200px) {
  .stock-analysis-overview__grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .stock-analysis-overview__quote {
    align-items: flex-start;
    flex-direction: column;
  }

  .stock-analysis-overview__metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
</style>
