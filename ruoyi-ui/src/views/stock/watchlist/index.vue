<template>
  <div class="app-container">
    <el-card shadow="never">
      <div slot="header">我的自选</div>
      <el-form :inline="true" :model="form" @submit.native.prevent="handleAdd">
        <el-form-item label="股票代码"><el-input v-model="form.stockCode" placeholder="如 600519 或 sh600519" clearable /></el-form-item>
        <el-form-item label="股票名称"><el-input v-model="form.stockName" placeholder="可选" clearable /></el-form-item>
        <el-form-item><el-button v-hasPermi="['stock:watchlist:add']" type="primary" :loading="adding" @click="handleAdd">加入自选</el-button></el-form-item>
      </el-form>

      <el-table v-loading="loading" :data="rows" row-key="stockCode" :expand-row-keys="expandedCodes">
        <el-table-column type="expand" width="1"><template slot-scope="scope"><div class="analysis-panel" v-loading="analysisLoading[scope.row.stockCode]">
          <template v-if="analysisByCode[scope.row.stockCode]">
            <div class="stock-title"><b>{{ analysis(scope.row).stock.name }}</b> {{ analysis(scope.row).stock.code }}　{{ analysis(scope.row).stock.currentPrice }} 元　{{ analysis(scope.row).stock.changePct }}%</div>
            <el-row :gutter="12" class="section">
              <el-col :span="4" v-for="item in marketItems(analysis(scope.row).stock)" :key="item.label"><div class="metric"><small>{{ item.label }}</small><b>{{ item.value }}</b></div></el-col>
            </el-row>
            <el-row :gutter="12" class="section">
              <el-col :span="8"><div class="metric"><small>MA5</small><b>{{ analysis(scope.row).stock.ma5 || '--' }}</b></div></el-col>
              <el-col :span="8"><div class="metric"><small>MA20</small><b>{{ analysis(scope.row).stock.ma20 || '--' }}</b></div></el-col>
              <el-col :span="8"><div class="metric"><small>20日均线趋势</small><b>{{ analysis(scope.row).trendDesc }}</b></div></el-col>
            </el-row>
            <el-card class="section" shadow="never"><div slot="header">交易信号</div>
              <p><el-tag>{{ analysis(scope.row).signal.type }}</el-tag> {{ analysis(scope.row).signal.description }}</p>
              <p>置信度：{{ analysis(scope.row).signal.confidence }}　建议仓位：{{ analysis(scope.row).signal.suggestedPosition }}</p>
              <p>系统理由：{{ analysis(scope.row).signal.reason }}</p>
            </el-card>
            <el-card class="section" shadow="never"><div slot="header">操作纪律提醒</div>
              <ol><li v-for="rule in tradingRules" :key="rule">{{ rule }}</li></ol>
            </el-card>
            <el-button type="primary" size="small" :loading="aiLoading[scope.row.stockCode]" @click="handleAiAnalyze(scope.row)">AI分析</el-button>
            <el-card v-if="aiShown[scope.row.stockCode]" class="section" shadow="never"><div slot="header">DeepSeek AI 分析报告</div>
              <p><b>AI 操作建议：</b>{{ analysis(scope.row).aiAdvice }}</p><p><b>AI 分析理由：</b>{{ analysis(scope.row).aiReason }}</p>
            </el-card>
          </template>
        </div></template></el-table-column>
        <el-table-column label="股票代码" prop="stockCode" width="150" />
        <el-table-column label="股票名称" prop="stockName" min-width="180"><template slot-scope="scope">{{ scope.row.stockName || '--' }}</template></el-table-column>
        <el-table-column label="加入时间" prop="createTime" width="180" />
        <el-table-column label="操作" width="180" align="center"><template slot-scope="scope">
          <el-button size="mini" type="text" @click="handleAnalyze(scope.row)">分析</el-button>
          <el-button v-hasPermi="['stock:watchlist:remove']" size="mini" type="text" @click="handleRemove(scope.row)">删除</el-button>
        </template></el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script>
import { analyzeStock } from '@/api/stock/analyzer'
import { addWatchlist, listWatchlist, removeWatchlist } from '@/api/stock/watchlist'
export default {
  name: 'StockWatchlist',
  data() {
    return {
      loading: false, adding: false, rows: [], form: { stockCode: '', stockName: '' }, expandedCodes: [], analysisByCode: {}, analysisLoading: {}, aiLoading: {}, aiShown: {},
      tradingRules: ['20日线向下，坚决不进场', '金叉进场，首次三成仓', '跌破5日线止损', '跌破20日线清仓', '盈利3%-5%落袋为安', '保留五成以上现金']
    }
  },
  created() { this.getList() },
  methods: {
    analysis(row) { return this.analysisByCode[row.stockCode] },
    getList() { this.loading = true; listWatchlist().then(res => { this.rows = res.data || [] }).finally(() => { this.loading = false }) },
    handleAdd() {
      if (!this.form.stockCode.trim()) return this.$modal.msgWarning('请输入股票代码')
      this.adding = true
      addWatchlist(this.form).then(() => { this.$modal.msgSuccess('已加入自选'); this.form = { stockCode: '', stockName: '' }; this.getList() }).finally(() => { this.adding = false })
    },
    handleAnalyze(row) {
      const code = row.stockCode
      if (this.expandedCodes[0] === code) return (this.expandedCodes = [])
      this.expandedCodes = [code]
      this.$set(this.aiShown, code, false)
      this.$set(this.analysisLoading, code, true)
      analyzeStock({ stockCode: code, includeAi: false }).then(res => { this.$set(this.analysisByCode, code, res.data) }).finally(() => { this.$set(this.analysisLoading, code, false) })
    },
    handleAiAnalyze(row) {
      const code = row.stockCode
      this.$set(this.aiLoading, code, true)
      analyzeStock({ stockCode: code, includeAi: true }).then(res => { this.$set(this.analysisByCode, code, res.data); this.$set(this.aiShown, code, true) }).finally(() => { this.$set(this.aiLoading, code, false) })
    },
    handleRemove(row) { this.$modal.confirm('确认删除该自选股吗？').then(() => removeWatchlist(row.watchlistId)).then(() => { this.$modal.msgSuccess('删除成功'); this.getList() }).catch(() => {}) },
    marketItems(stock) { return [{ label: '开盘价', value: stock.openPrice }, { label: '昨收价', value: stock.prevClose }, { label: '最高价', value: stock.high }, { label: '最低价', value: stock.low }, { label: '成交量', value: stock.volume }, { label: '成交额', value: stock.amount }] }
  }
}
</script>

<style scoped>
.analysis-panel { padding: 12px 24px; min-height: 60px; background: #fafafa; }
.stock-title { font-size: 16px; margin-bottom: 12px; }
.section { margin-top: 12px; }
.metric { background: #fff; padding: 10px; text-align: center; border-radius: 4px; display: grid; gap: 4px; }
.metric small { color: #909399; }
ol { margin: 0; padding-left: 20px; line-height: 1.8; }
</style>
