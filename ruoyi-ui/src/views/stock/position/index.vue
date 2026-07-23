<template>
  <div class="stock-page position-page">
    <header class="stock-page__header">
      <div>
        <div class="stock-page__eyebrow">Portfolio</div>
        <h1 class="stock-page__title">我的持仓</h1>
        <p class="stock-page__subtitle">统一查看持仓成本、仓位结构、浮动盈亏与策略分析</p>
      </div>
      <div class="stock-actions position-header-actions">
        <el-button v-hasPermi="['stock:position:edit']" icon="el-icon-wallet" @click="openAccount">账户总资产</el-button>
        <el-button v-hasPermi="['stock:position:add']" type="primary" icon="el-icon-plus" @click="openAdd">新增持仓</el-button>
      </div>
    </header>

    <div class="stock-summary-grid">
      <div class="stock-summary summary-primary">
        <div class="stock-summary__label">账户总资产</div>
        <div class="stock-summary__value stock-number">{{ totalAssets === null ? '未配置' : formatMoney(totalAssets) }}</div>
        <div class="stock-summary__hint">{{ totalAssets === null ? '配置后可计算真实持仓比例' : '人民币 / 元' }}</div>
      </div>
      <div class="stock-summary">
        <div class="stock-summary__label">录入持仓成本</div>
        <div class="stock-summary__value stock-number">{{ formatMoney(totalCost) }}</div>
        <div class="stock-summary__hint">按成本价 × 持仓数量汇总</div>
      </div>
      <div class="stock-summary">
        <div class="stock-summary__label">持仓标的</div>
        <div class="stock-summary__value stock-number">{{ rows.length }}</div>
        <div class="stock-summary__hint">当前账户记录的股票数量</div>
      </div>
      <div class="stock-summary">
        <div class="stock-summary__label">成本资金占比</div>
        <div class="stock-summary__value stock-number">{{ costAllocationLabel }}</div>
        <div class="stock-summary__hint">{{ totalAssets === null ? '请先配置账户总资产' : '基于录入成本估算，非实时市值' }}</div>
      </div>
    </div>

    <el-card class="stock-card stock-table-card" shadow="never">
      <div slot="header" class="stock-card__header table-heading">
        <div>
          <h2 class="stock-card__title">持仓明细</h2>
          <p class="stock-card__description">展开单只股票，查看行情、浮盈亏和 520 策略建议</p>
        </div>
        <el-button type="text" icon="el-icon-refresh" :loading="listLoading" @click="load">刷新数据</el-button>
      </div>

      <el-table
        v-loading="listLoading"
        :data="rows"
        row-key="positionId"
        :expand-row-keys="expanded"
        class="position-table"
        @expand-change="handleExpandChange"
      >
        <el-table-column type="expand" width="48">
          <template slot-scope="scope">
            <div v-loading="loading[scope.row.positionId]" class="stock-expand-panel position-analysis">
              <template v-if="report(scope.row)">
                <div class="stock-expand-panel__header">
                  <div class="stock-identity">
                    <span class="stock-identity__avatar">{{ stockInitial(reportStock(scope.row)) }}</span>
                    <div>
                      <span class="stock-identity__name report-name">{{ display(reportStock(scope.row).name) }}</span>
                      <span class="stock-identity__code">{{ display(reportStock(scope.row).code) }}</span>
                    </div>
                  </div>
                  <div class="analysis-price">
                    <strong class="stock-number" :class="changeClass(reportStock(scope.row))">
                      {{ formatNumber(reportStock(scope.row).currentPrice) }}
                    </strong>
                    <span class="stock-number" :class="changeClass(reportStock(scope.row))">
                      {{ signed(reportStock(scope.row).changePct) }}%
                    </span>
                  </div>
                </div>

                <div class="stock-metric-grid compact-metrics">
                  <div v-for="item in quoteMetrics(scope.row)" :key="item.label" class="stock-metric">
                    <div class="stock-metric__label">{{ item.label }}</div>
                    <div class="stock-metric__value stock-number" :class="item.className">{{ item.value }}</div>
                    <div class="stock-metric__hint">{{ item.hint }}</div>
                  </div>
                </div>

                <div class="stock-detail-grid report-grid">
                  <section class="stock-detail-panel">
                    <div class="stock-section-title">
                      <strong>持仓表现</strong>
                      <span class="stock-badge" :class="profitBadgeClass(reportHolding(scope.row).profitAmount)">
                        {{ profitLabel(reportHolding(scope.row).profitAmount) }}
                      </span>
                    </div>
                    <div class="stock-field-grid holding-fields">
                      <div class="stock-field">
                        <span class="stock-field__label">持仓成本</span>
                        <strong class="stock-field__value stock-number">{{ formatMoney(reportHolding(scope.row).costAmount) }}</strong>
                      </div>
                      <div class="stock-field">
                        <span class="stock-field__label">实时市值</span>
                        <strong class="stock-field__value stock-number">{{ formatMoney(reportHolding(scope.row).marketValue) }}</strong>
                      </div>
                      <div class="stock-field">
                        <span class="stock-field__label">浮动盈亏</span>
                        <strong class="stock-field__value stock-number" :class="profitClass(reportHolding(scope.row).profitAmount)">
                          {{ formatSignedMoney(reportHolding(scope.row).profitAmount) }}
                        </strong>
                      </div>
                      <div class="stock-field">
                        <span class="stock-field__label">浮盈亏率</span>
                        <strong class="stock-field__value stock-number" :class="profitClass(reportHolding(scope.row).profitPct)">
                          {{ formatPercent(reportHolding(scope.row).profitPct, true) }}
                        </strong>
                      </div>
                      <div class="stock-field">
                        <span class="stock-field__label">持仓比例</span>
                        <strong class="stock-field__value stock-number">{{ formatPercent(reportHolding(scope.row).positionPct) }}</strong>
                      </div>
                      <div class="stock-field">
                        <span class="stock-field__label">账户总资产</span>
                        <strong class="stock-field__value stock-number">{{ formatMoney(reportHolding(scope.row).totalAssets) }}</strong>
                      </div>
                    </div>
                  </section>

                  <section class="stock-detail-panel">
                    <div class="stock-section-title">
                      <strong>520 均线策略</strong>
                      <span class="stock-badge" :class="trendBadgeClass(report(scope.row).trend20ma)">
                        {{ trendLabel(report(scope.row).trend20ma) }}
                      </span>
                    </div>
                    <div class="stock-field-grid strategy-fields">
                      <div class="stock-field">
                        <span class="stock-field__label">MA5</span>
                        <strong class="stock-field__value stock-number">{{ formatNumber(reportStock(scope.row).ma5) }}</strong>
                      </div>
                      <div class="stock-field">
                        <span class="stock-field__label">MA20</span>
                        <strong class="stock-field__value stock-number">{{ formatNumber(reportStock(scope.row).ma20) }}</strong>
                      </div>
                      <div class="stock-field">
                        <span class="stock-field__label">趋势判断</span>
                        <strong class="stock-field__value">{{ display(report(scope.row).trendDesc) }}</strong>
                      </div>
                    </div>
                    <div class="signal-description">{{ display(reportSignal(scope.row).description) }}</div>
                    <div class="stock-inline-meta signal-meta">
                      <span>置信度 <strong>{{ confidenceLabel(reportSignal(scope.row).confidence) }}</strong></span>
                      <span>建议仓位 <strong class="primary-text">{{ display(reportSignal(scope.row).suggestedPosition) }}</strong></span>
                    </div>
                    <div class="stock-callout">{{ display(reportSignal(scope.row).reason) }}</div>
                  </section>
                </div>

                <section v-if="hasIndicators(scope.row)" class="stock-detail-panel indicator-panel">
                  <div class="stock-section-title">
                    <strong>量价与市场环境</strong>
                    <span class="stock-badge">辅助指标</span>
                  </div>
                  <div class="indicator-grid">
                    <div v-for="item in indicatorMetrics(scope.row)" :key="item.label" class="indicator-item">
                      <span>{{ item.label }}</span>
                      <strong class="stock-number">{{ item.value }}</strong>
                    </div>
                  </div>
                </section>

                <section class="ai-action-panel">
                  <div>
                    <strong>AI 持仓诊断</strong>
                    <span>结合成本、仓位、量价与趋势生成个性化操作建议</span>
                  </div>
                  <el-button
                    v-hasPermi="['stock:position:analyze']"
                    type="primary"
                    plain
                    icon="el-icon-cpu"
                    :loading="aiLoading[scope.row.positionId]"
                    @click="analyze(scope.row, true)"
                  >AI 分析</el-button>
                </section>

                <section v-if="aiShown[scope.row.positionId]" class="stock-detail-panel ai-result-panel">
                  <div class="stock-section-title">
                    <strong>DeepSeek AI 分析报告</strong>
                    <el-tag :type="riskTagType(report(scope.row).riskLevel)" size="small" effect="plain">
                      风险等级 · {{ display(report(scope.row).riskLevel) }}
                    </el-tag>
                  </div>
                  <div class="stock-report">
                    <div class="stock-report__advice">
                      <span class="stock-report__icon"><i class="el-icon-cpu" /></span>
                      <div>
                        <div class="stock-report__label">AI 操作建议</div>
                        <div class="stock-report__value">{{ display(report(scope.row).aiAdvice) }}</div>
                      </div>
                    </div>
                    <div class="stock-report__reason">{{ display(report(scope.row).aiReason) }}</div>
                  </div>
                </section>
              </template>

              <div v-else class="stock-empty report-empty">
                <i class="el-icon-data-analysis stock-empty__icon" />
                <div class="stock-empty__title">暂无已保存的持仓分析</div>
                <p class="stock-empty__description">发起一次技术分析，系统会保存最新行情、盈亏和策略判断。</p>
                <el-button
                  v-hasPermi="['stock:position:analyze']"
                  type="primary"
                  icon="el-icon-data-analysis"
                  @click="analyze(scope.row, false)"
                >立即分析</el-button>
              </div>
            </div>
          </template>
        </el-table-column>

        <el-table-column label="股票" min-width="220">
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
        <el-table-column label="成本价" min-width="130" align="right">
          <template slot-scope="scope"><span class="stock-number table-number">¥ {{ formatNumber(scope.row.costPrice) }}</span></template>
        </el-table-column>
        <el-table-column label="持仓数量" min-width="130" align="right">
          <template slot-scope="scope"><span class="stock-number table-number">{{ formatInteger(scope.row.quantity) }}</span></template>
        </el-table-column>
        <el-table-column label="持仓比例" min-width="190">
          <template slot-scope="scope">
            <div v-if="validPercent(scope.row.positionPct)" class="position-ratio">
              <el-progress
                class="stock-progress"
                :percentage="progressPercent(scope.row.positionPct)"
                :stroke-width="6"
                :show-text="false"
              />
              <span class="stock-number">{{ formatPercent(scope.row.positionPct) }}</span>
            </div>
            <span v-else class="table-secondary">--</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="210" align="right" fixed="right">
          <template slot-scope="scope">
            <el-button v-hasPermi="['stock:position:edit']" type="text" icon="el-icon-edit" @click="openEdit(scope.row)">编辑</el-button>
            <el-button
              v-hasPermi="['stock:position:analyze']"
              type="text"
              icon="el-icon-data-analysis"
              @click="analyze(scope.row, false)"
            >分析</el-button>
          </template>
        </el-table-column>

        <template slot="empty">
          <div class="stock-empty">
            <i class="el-icon-wallet stock-empty__icon" />
            <div class="stock-empty__title">还没有持仓记录</div>
            <p class="stock-empty__description">新增第一笔持仓后，可统一查看仓位、盈亏和策略分析。</p>
          </div>
        </template>
      </el-table>
    </el-card>

    <el-dialog
      title="新增持仓"
      :visible.sync="addVisible"
      width="460px"
      custom-class="stock-dialog"
      append-to-body
    >
      <el-form :model="addForm" label-width="88px">
        <el-form-item label="股票代码" required>
          <el-input v-model="addForm.stockCode" placeholder="例如 600519" />
        </el-form-item>
        <el-form-item label="成本价" required>
          <el-input-number v-model="addForm.costPrice" :min="0.01" :precision="2" :step="0.1" controls-position="right" />
        </el-form-item>
        <el-form-item label="持仓数量" required>
          <el-input-number v-model="addForm.quantity" :min="1" :precision="0" controls-position="right" />
        </el-form-item>
      </el-form>
      <div slot="footer" class="dialog-footer">
        <el-button @click="addVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveAdd">保存持仓</el-button>
      </div>
    </el-dialog>

    <el-dialog
      title="账户总资产"
      :visible.sync="accountVisible"
      width="460px"
      custom-class="stock-dialog"
      append-to-body
    >
      <div class="dialog-tip"><i class="el-icon-info" /> 用于计算持仓比例，不会自动产生交易或资金变动。</div>
      <el-form :model="accountForm" label-width="88px">
        <el-form-item label="总资产" required>
          <el-input-number v-model="accountForm.totalAssets" :min="0.01" :precision="2" :step="1000" controls-position="right" />
        </el-form-item>
      </el-form>
      <div slot="footer" class="dialog-footer">
        <el-button @click="accountVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveTotalAssets">保存设置</el-button>
      </div>
    </el-dialog>

    <el-dialog
      title="编辑持仓"
      :visible.sync="visible"
      width="460px"
      custom-class="stock-dialog"
      append-to-body
    >
      <el-form :model="edit" label-width="88px">
        <el-form-item label="股票代码">
          <el-input v-model="edit.stockCode" disabled />
        </el-form-item>
        <el-form-item label="成本价" required>
          <el-input-number v-model="edit.costPrice" :min="0.01" :precision="2" :step="0.1" controls-position="right" />
        </el-form-item>
        <el-form-item label="持仓数量" required>
          <el-input-number v-model="edit.quantity" :min="1" :precision="0" controls-position="right" />
        </el-form-item>
      </el-form>
      <div slot="footer" class="dialog-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveEdit">保存修改</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import {
  listPosition,
  addPosition,
  updatePosition,
  account,
  saveAccount,
  analyzePosition,
  getPositionAnalysis
} from '@/api/stock/position'

export default {
  name: 'StockPosition',
  data() {
    return {
      rows: [],
      listLoading: false,
      saving: false,
      visible: false,
      addVisible: false,
      accountVisible: false,
      edit: {},
      addForm: {},
      accountForm: {},
      accountSummary: null,
      expanded: [],
      reports: {},
      loaded: {},
      loading: {},
      aiLoading: {},
      aiShown: {}
    }
  },
  computed: {
    totalAssets() {
      const raw = this.accountSummary && this.accountSummary.totalAssets
      if (raw === null || raw === undefined || raw === '') return null
      const value = Number(raw)
      return Number.isFinite(value) ? value : null
    },
    totalCost() {
      return this.rows.reduce((sum, row) => {
        const cost = Number(row.costPrice)
        const quantity = Number(row.quantity)
        const amount = cost * quantity
        return sum + (Number.isFinite(amount) ? amount : 0)
      }, 0)
    },
    costAllocationLabel() {
      if (this.totalAssets === null || this.totalAssets <= 0) return '--'
      return `${(this.totalCost / this.totalAssets * 100).toFixed(2)}%`
    }
  },
  created() {
    this.load()
  },
  methods: {
    report(row) {
      return row ? this.reports[row.positionId] : null
    },
    reportStock(row) {
      return (this.report(row) && this.report(row).stock) || {}
    },
    reportHolding(row) {
      return (this.report(row) && this.report(row).holding) || {}
    },
    reportIndicators(row) {
      return (this.report(row) && this.report(row).indicators) || {}
    },
    reportSignal(row) {
      return (this.report(row) && this.report(row).signal) || {}
    },
    load() {
      this.listLoading = true
      this.loadAccountSummary()
      listPosition().then(res => {
        this.rows = res.data || []
      }).finally(() => {
        this.listLoading = false
      })
    },
    openAdd() {
      this.addForm = { stockCode: '', costPrice: null, quantity: null }
      this.addVisible = true
    },
    saveAdd() {
      if (!this.addForm.stockCode || !(this.addForm.costPrice > 0 && this.addForm.quantity > 0)) {
        this.$modal.msgWarning('请填写股票代码、成本价和持仓数量')
        return
      }
      this.saving = true
      addPosition(this.addForm).then(() => {
        this.$modal.msgSuccess('新增成功')
        this.addVisible = false
        this.load()
      }).finally(() => {
        this.saving = false
      })
    },
    openAccount() {
      account().then(res => {
        this.accountForm = { totalAssets: res.data ? res.data.totalAssets : null }
        this.accountVisible = true
      })
    },
    saveTotalAssets() {
      if (!(this.accountForm.totalAssets > 0)) {
        this.$modal.msgWarning('账户总资产必须大于零')
        return
      }
      this.saving = true
      saveAccount(this.accountForm).then(() => {
        this.$modal.msgSuccess('保存成功')
        this.accountVisible = false
        this.load()
      }).finally(() => {
        this.saving = false
      })
    },
    openEdit(row) {
      this.edit = {
        positionId: row.positionId,
        stockCode: row.stockCode,
        stockName: row.stockName,
        costPrice: row.costPrice,
        quantity: row.quantity
      }
      this.visible = true
    },
    saveEdit() {
      if (!(this.edit.costPrice > 0 && this.edit.quantity > 0)) {
        this.$modal.msgWarning('成本价和数量必须大于零')
        return
      }
      this.saving = true
      updatePosition(this.edit).then(() => {
        this.$modal.msgSuccess('保存成功')
        this.visible = false
        this.load()
      }).finally(() => {
        this.saving = false
      })
    },
    handleExpandChange(row, expandedRows) {
      const id = row.positionId
      const isExpanded = expandedRows.some(item => item.positionId === id)
      if (!isExpanded) {
        if (this.expanded[0] === id) this.expanded = []
        return
      }
      this.expanded = [id]
      if (this.loaded[id] || this.loading[id]) return
      this.loadSavedAnalysis(row)
    },
    loadSavedAnalysis(row) {
      const id = row.positionId
      this.$set(this.loading, id, true)
      getPositionAnalysis(id).then(res => {
        if (res.data) this.$set(this.reports, id, res.data)
        this.$set(this.aiShown, id, Boolean(res.data && res.data.aiAdvice))
        this.$set(this.loaded, id, true)
      }).finally(() => {
        this.$set(this.loading, id, false)
      })
    },
    analyze(row, includeAi) {
      const id = row.positionId
      this.expanded = [id]
      this.$set(includeAi ? this.aiLoading : this.loading, id, true)
      analyzePosition(id, includeAi).then(res => {
        this.$set(this.reports, id, res.data)
        this.$set(this.loaded, id, true)
        this.$set(this.aiShown, id, Boolean(res.data && res.data.aiAdvice))
        this.loadAccountSummary()
      }).finally(() => {
        this.$set(includeAi ? this.aiLoading : this.loading, id, false)
      })
    },
    loadAccountSummary() {
      account().then(res => {
        this.accountSummary = res.data || null
      })
    },
    quoteMetrics(row) {
      const stock = this.reportStock(row)
      return [
        { label: '开盘价', value: this.formatNumber(stock.openPrice), hint: '人民币 / 元', className: '' },
        { label: '昨收价', value: this.formatNumber(stock.prevClose), hint: '人民币 / 元', className: '' },
        { label: '最高价', value: this.formatNumber(stock.high), hint: '今日最高', className: this.relativeClass(stock.high, stock.prevClose) },
        { label: '最低价', value: this.formatNumber(stock.low), hint: '今日最低', className: this.relativeClass(stock.low, stock.prevClose) },
        { label: '成交量', value: this.formatCompact(stock.volume), hint: '成交手数', className: '' },
        { label: '成交额', value: this.formatCompact(stock.amount), hint: '人民币', className: '' }
      ]
    },
    indicatorMetrics(row) {
      const indicators = this.reportIndicators(row)
      return [
        { label: '放量倍数', value: this.display(indicators.volumeRatio) },
        { label: '缩量比例', value: this.display(indicators.contractionRatio) },
        { label: '震荡区间', value: `${this.display(indicators.rangeLow)} – ${this.display(indicators.rangeHigh)}` },
        { label: '大盘趋势', value: this.display(indicators.indexTrend) },
        { label: '板块趋势', value: '暂未接入' }
      ]
    },
    hasIndicators(row) {
      return Boolean(this.report(row) && this.report(row).indicators)
    },
    stockInitial(row) {
      const text = (row && (row.name || row.stockName || row.code || row.stockCode)) || '股'
      return text.slice(0, 1).toUpperCase()
    },
    display(value) {
      return value === null || value === undefined || value === '' ? '--' : value
    },
    formatNumber(value) {
      if (value === null || value === undefined || value === '') return '--'
      const number = Number(value)
      return Number.isFinite(number) ? number.toFixed(2) : '--'
    },
    formatInteger(value) {
      if (value === null || value === undefined || value === '') return '--'
      const number = Number(value)
      return Number.isFinite(number) ? Math.round(number).toLocaleString() : '--'
    },
    formatMoney(value) {
      if (value === null || value === undefined || value === '') return '--'
      const number = Number(value)
      return Number.isFinite(number) ? `¥ ${number.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '--'
    },
    formatSignedMoney(value) {
      if (value === null || value === undefined || value === '') return '--'
      const number = Number(value)
      if (!Number.isFinite(number)) return '--'
      const prefix = number > 0 ? '+' : number < 0 ? '-' : ''
      return `${prefix}¥ ${Math.abs(number).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    },
    formatPercent(value, signed = false) {
      if (value === null || value === undefined || value === '') return '--'
      const number = Number(value)
      if (!Number.isFinite(number)) return '--'
      return `${signed && number > 0 ? '+' : ''}${number.toFixed(2)}%`
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
    changeClass(stock) {
      return Number(stock && stock.changePct) >= 0 ? 'stock-up' : 'stock-down'
    },
    relativeClass(value, baseline) {
      const current = Number(value)
      const reference = Number(baseline)
      if (!Number.isFinite(current) || !Number.isFinite(reference)) return ''
      return current >= reference ? 'stock-up' : 'stock-down'
    },
    profitClass(value) {
      if (value === null || value === undefined || value === '') return ''
      const number = Number(value)
      if (!Number.isFinite(number) || number === 0) return ''
      return number > 0 ? 'stock-up' : 'stock-down'
    },
    profitBadgeClass(value) {
      if (value === null || value === undefined || value === '') return ''
      const number = Number(value)
      if (!Number.isFinite(number) || number === 0) return ''
      return number > 0 ? 'stock-badge--up' : 'stock-badge--down'
    },
    profitLabel(value) {
      if (value === null || value === undefined || value === '') return '盈亏未知'
      const number = Number(value)
      if (!Number.isFinite(number)) return '盈亏未知'
      if (number > 0) return '当前盈利'
      if (number < 0) return '当前亏损'
      return '盈亏持平'
    },
    validPercent(value) {
      if (value === null || value === undefined || value === '') return false
      return Number.isFinite(Number(value))
    },
    progressPercent(value) {
      return Math.max(0, Math.min(100, Number(value) || 0))
    },
    trendLabel(trend) {
      return { UP: '多头趋势', DOWN: '空头趋势', FLAT: '震荡整理' }[trend] || '趋势未知'
    },
    trendBadgeClass(trend) {
      if (trend === 'UP') return 'stock-badge--up'
      if (trend === 'DOWN') return 'stock-badge--down'
      return 'stock-badge--warning'
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
.position-header-actions {
  flex-wrap: nowrap;
}

.summary-primary {
  border-color: #bfdbfe;
  background: linear-gradient(135deg, #fff 0%, #eff6ff 100%);
}

.table-heading {
  padding: 2px 4px;
}

.position-table {
  ::v-deep .el-table__expanded-cell {
    padding: 0;
  }
}

.table-number {
  color: var(--stock-text);
  font-weight: 600;
}

.table-secondary {
  color: var(--stock-muted);
}

.position-ratio {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--stock-muted);
  font-size: 12px;
}

.report-name {
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

.compact-metrics,
.report-grid,
.indicator-panel {
  margin-bottom: 16px;
}

.holding-fields,
.strategy-fields {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.signal-description {
  margin-top: 14px;
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

.indicator-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}

.indicator-item {
  min-width: 0;

  span,
  strong {
    display: block;
  }

  span {
    color: var(--stock-muted);
    font-size: 12px;
  }

  strong {
    margin-top: 7px;
    overflow-wrap: anywhere;
    color: var(--stock-text);
    font-size: 14px;
  }
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

.report-empty {
  padding-top: 30px;
  padding-bottom: 30px;

  .el-button {
    margin-top: 16px;
  }
}

.dialog-tip {
  margin-bottom: 22px;
  padding: 11px 13px;
  border-radius: 7px;
  background: var(--stock-primary-soft);
  color: #475467;
  font-size: 12px;
  line-height: 1.6;

  i {
    margin-right: 5px;
    color: var(--stock-primary);
  }
}

@media (max-width: 1100px) {
  .indicator-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .position-header-actions {
    width: 100%;
  }

  .holding-fields,
  .strategy-fields,
  .indicator-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ai-action-panel {
    align-items: stretch;
    flex-direction: column;
  }
}

@media (max-width: 480px) {
  .position-header-actions,
  .holding-fields,
  .strategy-fields,
  .indicator-grid {
    grid-template-columns: 1fr;
  }

  .position-header-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
