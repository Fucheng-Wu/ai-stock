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
        <stock-analysis-overview
          :result="result"
          :updated-at="formattedResultSavedAt"
        />

        <stock-strategy-report
          :result="result"
          :ai-loading="aiLoading"
          @ai-analyze="handleAiAnalyze"
        />
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
import StockAnalysisOverview from '@/components/StockAnalysisOverview'
import StockStrategyReport from '@/components/StockStrategyReport'
import { saveAnalysisSession, loadAnalysisSession } from '@/utils/stock-analyzer-session'
import { hasAiAnalysis, hasSameKline, reuseAiAnalysis } from '@/utils/stock-ai-cache'

export default {
  name: 'StockAnalyzer',
  components: {
    StockAnalysisOverview,
    StockStrategyReport
  },
  data() {
    return {
      stockCode: '',
      loading: false,
      aiLoading: false,
      errorMsg: '',
      result: null,
      resultSavedAt: null,
      marketData: []
    }
  },
  computed: {
    formattedResultSavedAt() {
      if (!this.resultSavedAt) return ''
      return new Date(this.resultSavedAt).toLocaleString('zh-CN', { hour12: false })
    },
    stock() {
      return (this.result && this.result.stock) || {}
    },
    signal() {
      return (this.result && this.result.signal) || {}
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
    }
  },
  created() {
    this.restoreLastAnalysis()
    const stockCode = this.$route.query.stockCode
    if (typeof stockCode === 'string' && stockCode.trim()) {
      this.stockCode = stockCode.trim()
      this.handleAnalyze()
    }
  },
  methods: {
    getSessionStorage() {
      try {
        return window.sessionStorage
      } catch (error) {
        return null
      }
    },
    restoreLastAnalysis() {
      const session = loadAnalysisSession(this.getSessionStorage())
      if (!session) return
      this.stockCode = session.stockCode
      this.result = session.result
      this.resultSavedAt = session.savedAt
      this.buildMarketData()
    },
    handleAnalyze() {
      if (this.loading || this.aiLoading) return
      this.runAnalyze()
    },
    runAnalyze() {
      if (this.loading || this.aiLoading) return
      const code = this.stockCode.trim()
      if (!code) {
        this.$message.warning('请输入股票代码')
        return
      }
      this.loading = true
      this.errorMsg = ''
      const previous = this.result
      this.result = null
      this.resultSavedAt = null
      analyzeStock({ stockCode: code, includeAi: false }).then(res => {
        const technicalResult = res.data
        if (hasAiAnalysis(previous) && hasSameKline(previous, technicalResult)) {
          return reuseAiAnalysis(technicalResult, previous)
        }
        return analyzeStock({ stockCode: code, includeAi: true }).then(aiRes => aiRes.data)
      }).then(result => {
        this.saveResult(code, result)
      }).catch(err => {
        this.errorMsg = err.msg || '分析失败，请检查股票代码是否正确后重试'
      }).finally(() => {
        this.loading = false
      })
    },
    handleAiAnalyze() {
      if (this.loading || this.aiLoading || !this.result) return
      const code = this.stockCode.trim()
      if (!code) return
      this.aiLoading = true
      analyzeStock({ stockCode: code, includeAi: true }).then(res => {
        this.saveResult(code, res.data)
      }).catch(err => {
        this.errorMsg = err.msg || 'AI 分析失败，请稍后重试'
      }).finally(() => {
        this.aiLoading = false
      })
    },
    saveResult(code, result) {
      this.result = result
      this.buildMarketData()
      const savedAt = Date.now()
      this.resultSavedAt = savedAt
      saveAnalysisSession(this.getSessionStorage(), code, this.result, savedAt)
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
