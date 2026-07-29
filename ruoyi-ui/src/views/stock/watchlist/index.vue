<template>
  <div class="stock-page watchlist-page">
    <header class="stock-page__header">
      <div>
        <div class="stock-page__eyebrow">Watchlist</div>
        <h1 class="stock-page__title">我的自选</h1>
        <p class="stock-page__subtitle">集中管理关注标的，按需展开技术分析与 AI 研判</p>
      </div>
      <span class="watchlist-count"><strong>{{ rows.length }}</strong> 只股票</span>
    </header>

    <el-card class="stock-card stock-toolbar-card" shadow="never">
      <el-form class="watchlist-form" :inline="true" :model="form" @submit.native.prevent="handleAdd">
        <el-form-item label="股票代码">
          <el-input
            v-model="form.stockCode"
            clearable
            prefix-icon="el-icon-search"
            placeholder="例如 600519 或 sh600519"
            @keyup.enter.native="handleAdd"
          />
        </el-form-item>
        <el-form-item label="股票名称">
          <el-input v-model="form.stockName" clearable placeholder="选填，便于识别" @keyup.enter.native="handleAdd" />
        </el-form-item>
        <el-form-item class="watchlist-form__action">
          <el-button
            v-hasPermi="['stock:watchlist:add']"
            type="primary"
            icon="el-icon-plus"
            :loading="adding"
            @click="handleAdd"
          >加入自选</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="stock-card stock-table-card" shadow="never">
      <div slot="header" class="stock-card__header table-heading">
        <div>
          <h2 class="stock-card__title">自选列表</h2>
          <p class="stock-card__description">点击“分析”查看实时行情、均线和交易信号</p>
        </div>
        <el-button type="text" icon="el-icon-refresh" :loading="loading" @click="getList">刷新列表</el-button>
      </div>

      <el-table
        v-loading="loading"
        :data="rows"
        row-key="stockCode"
        :expand-row-keys="expandedCodes"
        class="watchlist-table"
        @expand-change="handleExpandChange"
      >
        <el-table-column type="expand" width="48">
          <template slot-scope="scope">
            <div v-loading="analysisLoading[scope.row.stockCode]" class="stock-expand-panel watchlist-analysis">
              <template v-if="analysis(scope.row)">
                <stock-kline-chart :kline-data="analysis(scope.row).klineData || []" />
                <div class="stock-expand-panel__header">
                  <div class="stock-identity">
                    <span class="stock-identity__avatar">{{ stockInitial(analysis(scope.row).stock) }}</span>
                    <div>
                      <span class="stock-identity__name analysis-name">{{ display(analysis(scope.row).stock.name) }}</span>
                      <span class="stock-identity__code">{{ display(analysis(scope.row).stock.code) }}</span>
                    </div>
                  </div>
                  <div class="analysis-price">
                    <strong class="stock-number" :class="changeClass(analysis(scope.row).stock)">
                      {{ formatNumber(analysis(scope.row).stock.currentPrice) }}
                    </strong>
                    <span class="stock-number" :class="changeClass(analysis(scope.row).stock)">
                      {{ signed(analysis(scope.row).stock.changePct) }}%
                    </span>
                  </div>
                </div>

                <div class="stock-metric-grid compact-metrics">
                  <div v-for="item in marketItems(analysis(scope.row).stock)" :key="item.label" class="stock-metric">
                    <div class="stock-metric__label">{{ item.label }}</div>
                    <div class="stock-metric__value stock-number">{{ item.value }}</div>
                    <div class="stock-metric__hint">{{ item.hint }}</div>
                  </div>
                </div>

                <div class="stock-detail-grid analysis-grid">
                  <section class="stock-detail-panel">
                    <div class="stock-section-title">
                      <strong>均线趋势</strong>
                      <span class="stock-badge" :class="trendBadgeClass(analysis(scope.row).trend20ma)">
                        {{ display(analysis(scope.row).trendDesc) }}
                      </span>
                    </div>
                    <div class="stock-field-grid ma-fields">
                      <div class="stock-field">
                        <span class="stock-field__label">MA5</span>
                        <strong class="stock-field__value stock-number">{{ formatNumber(analysis(scope.row).stock.ma5) }}</strong>
                      </div>
                      <div class="stock-field">
                        <span class="stock-field__label">MA20</span>
                        <strong class="stock-field__value stock-number">{{ formatNumber(analysis(scope.row).stock.ma20) }}</strong>
                      </div>
                      <div class="stock-field">
                        <span class="stock-field__label">趋势状态</span>
                        <strong class="stock-field__value">{{ trendLabel(analysis(scope.row).trend20ma) }}</strong>
                      </div>
                    </div>
                  </section>

                  <section class="stock-detail-panel">
                    <div class="stock-section-title">
                      <strong>交易信号</strong>
                      <span class="stock-badge" :class="signalBadgeClass(analysis(scope.row).signal)">
                        {{ signalLabel(analysis(scope.row).signal) }}
                      </span>
                    </div>
                    <div class="signal-description">{{ display(analysis(scope.row).signal.description) }}</div>
                    <div class="stock-inline-meta signal-meta">
                      <span>置信度 <strong>{{ confidenceLabel(analysis(scope.row).signal.confidence) }}</strong></span>
                      <span>建议仓位 <strong class="primary-text">{{ display(analysis(scope.row).signal.suggestedPosition) }}</strong></span>
                    </div>
                    <div class="stock-callout">{{ display(analysis(scope.row).signal.reason) }}</div>
                  </section>
                </div>

                <section class="stock-detail-panel discipline-panel">
                  <div class="stock-section-title">
                    <strong>操作纪律</strong>
                    <i class="el-icon-lock discipline-icon" />
                  </div>
                  <ol class="stock-rule-list">
                    <li v-for="(rule, index) in tradingRules" :key="rule" class="stock-rule">
                      <span class="stock-rule__index">{{ String(index + 1).padStart(2, '0') }}</span>
                      <span>{{ rule }}</span>
                    </li>
                  </ol>
                </section>

                <section class="ai-action-panel">
                  <div>
                    <strong>需要更完整的分析？</strong>
                    <span>调用 DeepSeek 结合当前技术指标生成操作建议</span>
                  </div>
                  <el-button
                    type="primary"
                    plain
                    icon="el-icon-cpu"
                    :loading="aiLoading[scope.row.stockCode]"
                    @click="handleAiAnalyze(scope.row)"
                  >AI 分析</el-button>
                </section>

                <section v-if="aiShown[scope.row.stockCode]" class="stock-detail-panel ai-result-panel">
                  <div class="stock-section-title">
                    <strong>DeepSeek AI 分析报告</strong>
                    <el-tag :type="riskTagType(analysis(scope.row).riskLevel)" size="small" effect="plain">
                      风险等级 · {{ display(analysis(scope.row).riskLevel) }}
                    </el-tag>
                  </div>
                  <div class="stock-report">
                    <div class="stock-report__advice">
                      <span class="stock-report__icon"><i class="el-icon-cpu" /></span>
                      <div>
                        <div class="stock-report__label">AI 操作建议</div>
                        <div class="stock-report__value">{{ display(analysis(scope.row).aiAdvice) }}</div>
                      </div>
                    </div>
                    <div class="stock-report__reason">{{ display(analysis(scope.row).aiReason) }}</div>
                  </div>
                </section>
              </template>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="股票" min-width="240">
          <template slot-scope="scope">
            <div class="stock-identity">
              <span class="stock-identity__avatar">{{ stockInitial(scope.row) }}</span>
              <div>
                <span class="stock-identity__name">{{ scope.row.stockName || '未命名股票' }}</span>
                <span class="stock-identity__code">{{ scope.row.stockCode }}</span>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="加入时间" prop="createTime" min-width="180">
          <template slot-scope="scope">
            <span class="table-secondary"><i class="el-icon-time" /> {{ display(scope.row.createTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template slot-scope="scope">
            <span class="stock-badge" :class="expandedCodes[0] === scope.row.stockCode ? 'stock-badge--primary' : ''">
              {{ expandedCodes[0] === scope.row.stockCode ? '分析已展开' : '关注中' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190" align="right" fixed="right">
          <template slot-scope="scope">
            <el-button type="text" icon="el-icon-data-analysis" @click="handleAnalyze(scope.row)">
              分析
            </el-button>
            <el-button
              v-hasPermi="['stock:watchlist:remove']"
              class="danger-action"
              type="text"
              icon="el-icon-delete"
              @click="handleRemove(scope.row)"
            >移除</el-button>
          </template>
        </el-table-column>

        <template slot="empty">
          <div class="stock-empty">
            <i class="el-icon-star-off stock-empty__icon" />
            <div class="stock-empty__title">还没有自选股票</div>
            <p class="stock-empty__description">在上方输入股票代码，建立你的第一份关注列表。</p>
          </div>
        </template>
      </el-table>
    </el-card>
  </div>
</template>

<script>
import { analyzeStock } from '@/api/stock/analyzer'
import StockKlineChart from '@/views/stock/analyzer/components/StockKlineChart.vue'
import { addWatchlist, listWatchlist, removeWatchlist } from '@/api/stock/watchlist'
import { nextRequestVersion, isLatestRequest } from '@/utils/request-version'

export default {
  name: 'StockWatchlist',
  components: { StockKlineChart },
  data() {
    return {
      loading: false,
      adding: false,
      rows: [],
      form: { stockCode: '', stockName: '' },
      expandedCodes: [],
      analysisByCode: {},
      analysisRequestVersions: {},
      analysisLoading: {},
      aiLoading: {},
      aiShown: {},
      tradingRules: [
        '20 日线向下时坚决不进场',
        '金叉进场首次使用三成仓位',
        '跌破 5 日线及时止损',
        '跌破 20 日线无条件清仓',
        '盈利 3%–5% 时分批落袋',
        '始终保留五成以上现金'
      ]
    }
  },
  created() {
    this.getList()
  },
  methods: {
    analysis(row) {
      return row && row.stockCode ? this.analysisByCode[row.stockCode] : null
    },
    getList() {
      this.loading = true
      listWatchlist().then(res => {
        this.rows = res.data || []
      }).finally(() => {
        this.loading = false
      })
    },
    handleAdd() {
      const stockCode = this.form.stockCode.trim()
      if (!stockCode) {
        this.$modal.msgWarning('请输入股票代码')
        return
      }
      this.adding = true
      addWatchlist({ stockCode, stockName: this.form.stockName.trim() }).then(() => {
        this.$modal.msgSuccess('已加入自选')
        this.form = { stockCode: '', stockName: '' }
        this.getList()
      }).finally(() => {
        this.adding = false
      })
    },
    handleExpandChange(row, expandedRows) {
      const code = row.stockCode
      const isExpanded = expandedRows.some(item => item.stockCode === code)
      if (!isExpanded) {
        if (this.expandedCodes[0] === code) this.expandedCodes = []
        return
      }
      this.expandedCodes = [code]
      if (this.analysisByCode[code] || this.analysisLoading[code]) return
      this.loadAnalysis(row)
    },
    handleAnalyze(row) {
      this.expandedCodes = [row.stockCode]
      this.$set(this.aiShown, row.stockCode, false)
      this.loadAnalysis(row)
    },
    loadAnalysis(row) {
      const code = row.stockCode
      const requestVersion = nextRequestVersion(this.analysisRequestVersions, code)
      this.$set(this.aiShown, code, false)
      this.$set(this.aiLoading, code, false)
      this.$set(this.analysisLoading, code, true)
      analyzeStock({ stockCode: code, includeAi: false }).then(res => {
        if (!isLatestRequest(this.analysisRequestVersions, code, requestVersion)) return
        this.$set(this.analysisByCode, code, res.data)
      }).finally(() => {
        if (!isLatestRequest(this.analysisRequestVersions, code, requestVersion)) return
        this.$set(this.analysisLoading, code, false)
      })
    },
    handleAiAnalyze(row) {
      const code = row.stockCode
      const requestVersion = nextRequestVersion(this.analysisRequestVersions, code)
      this.$set(this.analysisLoading, code, false)
      this.$set(this.aiLoading, code, true)
      analyzeStock({ stockCode: code, includeAi: true }).then(res => {
        if (!isLatestRequest(this.analysisRequestVersions, code, requestVersion)) return
        this.$set(this.analysisByCode, code, res.data)
        this.$set(this.aiShown, code, true)
      }).finally(() => {
        if (!isLatestRequest(this.analysisRequestVersions, code, requestVersion)) return
        this.$set(this.aiLoading, code, false)
      })
    },
    handleRemove(row) {
      this.$modal.confirm(`确认从自选中移除 ${row.stockName || row.stockCode} 吗？`).then(() => {
        return removeWatchlist(row.watchlistId)
      }).then(() => {
        this.$modal.msgSuccess('移除成功')
        this.getList()
      }).catch(() => {})
    },
    stockInitial(row) {
      const text = (row && (row.name || row.stockName || row.code || row.stockCode)) || '股'
      return text.slice(0, 1).toUpperCase()
    },
    marketItems(stock) {
      const value = stock || {}
      return [
        { label: '开盘价', value: this.formatNumber(value.openPrice), hint: '人民币 / 元' },
        { label: '昨收价', value: this.formatNumber(value.prevClose), hint: '人民币 / 元' },
        { label: '最高价', value: this.formatNumber(value.high), hint: '今日最高' },
        { label: '最低价', value: this.formatNumber(value.low), hint: '今日最低' },
        { label: '成交量', value: this.formatCompact(value.volume), hint: '成交手数' },
        { label: '成交额', value: this.formatCompact(value.amount), hint: '人民币' }
      ]
    },
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
    display(value) {
      return value === null || value === undefined || value === '' ? '--' : value
    },
    changeClass(stock) {
      return Number(stock && stock.changePct) >= 0 ? 'stock-up' : 'stock-down'
    },
    trendLabel(trend) {
      return { UP: '多头趋势', DOWN: '空头趋势', FLAT: '震荡整理' }[trend] || '趋势未知'
    },
    trendBadgeClass(trend) {
      if (trend === 'UP') return 'stock-badge--up'
      if (trend === 'DOWN') return 'stock-badge--down'
      return 'stock-badge--warning'
    },
    signalLabel(signal) {
      const map = {
        GOLDEN_CROSS: '金叉',
        GOLDEN_CROSS_WEAK: '弱金叉',
        DEATH_CROSS: '死叉',
        RETRACE: '回踩',
        CONVERGENCE: '粘合发散',
        NONE: '暂无信号'
      }
      return map[signal && signal.type] || '暂无信号'
    },
    signalBadgeClass(signal) {
      const map = {
        GOLDEN_CROSS: 'stock-badge--up',
        GOLDEN_CROSS_WEAK: 'stock-badge--warning',
        DEATH_CROSS: 'stock-badge--down',
        RETRACE: 'stock-badge--primary',
        CONVERGENCE: 'stock-badge--primary'
      }
      return map[signal && signal.type] || ''
    },
    confidenceLabel(confidence) {
      return { HIGH: '高', MEDIUM: '中', LOW: '低' }[confidence] || confidence || '--'
    },
    riskTagType(level) {
      if (level === '低') return 'success'
      if (level === '中') return 'warning'
      if (level === '高') return 'danger'
      return 'info'
    }
  }
}
</script>

<style lang="scss">
@import "~@/assets/styles/stock-management.scss";
</style>

<style lang="scss" scoped>
.watchlist-count {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 10px 14px;
  border: 1px solid var(--stock-border);
  border-radius: 8px;
  background: #fff;
  color: var(--stock-muted);
  font-size: 13px;

  strong {
    color: var(--stock-primary);
    font-size: 20px;
  }
}

.watchlist-form {
  display: flex;
  align-items: flex-end;
  flex-wrap: wrap;
  gap: 12px;

  ::v-deep .el-form-item {
    margin: 0;
  }

  ::v-deep .el-form-item__label {
    float: none;
    display: block;
    padding: 0 0 7px;
    color: var(--stock-muted);
    line-height: 1;
  }

  ::v-deep .el-input {
    width: 260px;
  }
}

.watchlist-form__action {
  margin-left: auto !important;
}

.table-heading {
  padding: 2px 4px;
}

.watchlist-table {
  ::v-deep .el-table__expanded-cell {
    padding: 0;
  }
}

.watchlist-analysis .stock-kline-chart {
  margin-bottom: 16px;
}

.analysis-name {
  font-size: 16px;
}

.analysis-price {
  display: flex;
  align-items: baseline;
  gap: 10px;

  strong {
    font-size: 26px;
  }

  span {
    font-size: 14px;
    font-weight: 600;
  }
}

.compact-metrics {
  margin-bottom: 16px;
}

.analysis-grid {
  margin-bottom: 16px;
}

.ma-fields {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.signal-description {
  color: var(--stock-text);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.55;
}

.signal-meta {
  margin-top: 12px;
}

.primary-text {
  color: var(--stock-primary);
}

.discipline-panel {
  margin-bottom: 16px;
}

.discipline-icon {
  color: var(--stock-primary);
}

.ai-action-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border: 1px dashed #bfdbfe;
  border-radius: 8px;
  background: var(--stock-primary-soft);

  strong,
  span {
    display: block;
  }

  strong {
    color: var(--stock-text);
    font-size: 14px;
  }

  span {
    margin-top: 5px;
    color: var(--stock-muted);
    font-size: 12px;
  }
}

.ai-result-panel {
  margin-top: 16px;
}

.table-secondary {
  color: var(--stock-muted);
  font-size: 13px;
}

.danger-action {
  color: #d92d20;
}

@media (max-width: 768px) {
  .watchlist-form {
    align-items: stretch;
    flex-direction: column;

    ::v-deep .el-input {
      width: 100%;
    }
  }

  .watchlist-form__action {
    margin-left: 0 !important;

    ::v-deep .el-form-item__content,
    .el-button {
      width: 100%;
    }
  }

  .ai-action-panel {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
