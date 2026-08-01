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
        <el-button type="text" icon="el-icon-refresh" :loading="loading" @click="handleRefresh">刷新列表</el-button>
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
                <stock-analysis-overview :result="analysis(scope.row)" />

                <stock-strategy-report
                  :result="analysis(scope.row)"
                  :ai-loading="aiLoading[scope.row.stockCode]"
                  @ai-analyze="handleAiAnalyze(scope.row)"
                />
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
import StockAnalysisOverview from '@/components/StockAnalysisOverview'
import StockStrategyReport from '@/components/StockStrategyReport'
import { addWatchlist, listWatchlist, removeWatchlist } from '@/api/stock/watchlist'
import { nextRequestVersion, isLatestRequest } from '@/utils/request-version'
import { hasAiAnalysis, hasSameKline, reuseAiAnalysis } from '@/utils/stock-ai-cache'
import {
  WATCHLIST_ANALYSIS_CACHE_TTL,
  saveWatchlistAnalysisCache,
  loadWatchlistAnalysisCache,
  removeWatchlistAnalysisCache
} from '@/utils/stock-watchlist-cache'

export default {
  name: 'StockWatchlist',
  components: { StockAnalysisOverview, StockStrategyReport },
  data() {
    return {
      loading: false,
      adding: false,
      rows: [],
      form: { stockCode: '' },
      expandedCodes: [],
      analysisByCode: {},
      analysisSavedAtByCode: {},
      analysisRequestVersions: {},
      analysisLoading: {},
      aiLoading: {}
    }
  },
  created() {
    this.getList()
  },
  methods: {
    getSessionStorage() {
      try {
        return window.sessionStorage
      } catch (error) {
        return null
      }
    },
    analysis(row) {
      return row && row.stockCode ? this.analysisByCode[row.stockCode] : null
    },
    getList() {
      this.loading = true
      return listWatchlist().then(res => {
        this.rows = res.data || []
      }).finally(() => {
        this.loading = false
      })
    },
    handleRefresh() {
      const code = this.expandedCodes[0]
      if (!code) {
        this.getList()
        return
      }
      removeWatchlistAnalysisCache(this.getSessionStorage(), code)
      this.$delete(this.analysisSavedAtByCode, code)
      this.getList().then(() => {
        const row = this.rows.find(item => item.stockCode === code)
        if (row) this.loadAnalysis(row)
      })
    },
    handleAdd() {
      const stockCode = this.form.stockCode.trim()
      if (!stockCode) {
        this.$modal.msgWarning('请输入股票代码')
        return
      }
      this.adding = true
      addWatchlist({ stockCode }).then(() => {
        this.$modal.msgSuccess('已加入自选')
        this.form = { stockCode: '' }
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
      this.ensureAnalysis(row)
    },
    handleAnalyze(row) {
      this.expandedCodes = [row.stockCode]
      this.ensureAnalysis(row)
    },
    ensureAnalysis(row) {
      const code = row.stockCode
      if (this.analysisLoading[code]) return
      const savedAt = this.analysisSavedAtByCode[code]
      if (this.analysisByCode[code] && savedAt && Date.now() - savedAt < WATCHLIST_ANALYSIS_CACHE_TTL) return

      const cached = loadWatchlistAnalysisCache(this.getSessionStorage(), code)
      if (cached) {
        this.$set(this.analysisByCode, code, cached.result)
        this.$set(this.analysisSavedAtByCode, code, cached.savedAt)
        return
      }
      this.loadAnalysis(row)
    },
    loadAnalysis(row) {
      const code = row.stockCode
      const requestVersion = nextRequestVersion(this.analysisRequestVersions, code)
      const previous = this.analysisByCode[code]
      this.$set(this.aiLoading, code, false)
      this.$set(this.analysisLoading, code, true)
      analyzeStock({ stockCode: code, includeAi: false }).then(res => {
        if (!isLatestRequest(this.analysisRequestVersions, code, requestVersion)) return null
        const technicalResult = res.data
        if (hasAiAnalysis(previous) && hasSameKline(previous, technicalResult)) {
          return reuseAiAnalysis(technicalResult, previous)
        }
        return analyzeStock({ stockCode: code, includeAi: true }).then(aiRes => aiRes.data)
      }).then(result => {
        if (!isLatestRequest(this.analysisRequestVersions, code, requestVersion)) return
        if (result) this.saveAnalysis(code, result)
      }).finally(() => {
        if (!isLatestRequest(this.analysisRequestVersions, code, requestVersion)) return
        this.$set(this.analysisLoading, code, false)
      })
    },
    handleAiAnalyze(row) {
      const code = row.stockCode
      if (this.analysisLoading[code] || this.aiLoading[code]) return
      const requestVersion = nextRequestVersion(this.analysisRequestVersions, code)
      this.$set(this.aiLoading, code, true)
      analyzeStock({ stockCode: code, includeAi: true }).then(res => {
        if (!isLatestRequest(this.analysisRequestVersions, code, requestVersion)) return
        this.saveAnalysis(code, res.data)
      }).finally(() => {
        if (!isLatestRequest(this.analysisRequestVersions, code, requestVersion)) return
        this.$set(this.aiLoading, code, false)
      })
    },
    saveAnalysis(code, result) {
      const savedAt = Date.now()
      this.$set(this.analysisByCode, code, result)
      this.$set(this.analysisSavedAtByCode, code, savedAt)
      saveWatchlistAnalysisCache(this.getSessionStorage(), code, result, savedAt)
    },
    handleRemove(row) {
      this.$modal.confirm(`确认从自选中移除 ${row.stockName || row.stockCode} 吗？`).then(() => {
        return removeWatchlist(row.watchlistId)
      }).then(() => {
        this.$modal.msgSuccess('移除成功')
        removeWatchlistAnalysisCache(this.getSessionStorage(), row.stockCode)
        this.$delete(this.analysisByCode, row.stockCode)
        this.$delete(this.analysisSavedAtByCode, row.stockCode)
        this.getList()
      }).catch(() => {})
    },
    stockInitial(row) {
      const text = (row && (row.name || row.stockName || row.code || row.stockCode)) || '股'
      return text.slice(0, 1).toUpperCase()
    },
    formatNumber(value) {
      if (value === null || value === undefined || value === '') return '--'
      const number = Number(value)
      return Number.isFinite(number) ? number.toFixed(2) : '--'
    },
    display(value) {
      return value === null || value === undefined || value === '' ? '--' : value
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

}
</style>
