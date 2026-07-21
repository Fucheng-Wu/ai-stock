<template>
  <div class="app-container">
    <el-card shadow="never">
      <div slot="header">我的自选</div>
      <el-form :inline="true" :model="form" @submit.native.prevent="handleAdd">
        <el-form-item label="股票代码"><el-input v-model="form.stockCode" placeholder="如 600519 或 sh600519" clearable /></el-form-item>
        <el-form-item label="股票名称"><el-input v-model="form.stockName" placeholder="可选" clearable /></el-form-item>
        <el-form-item><el-button v-hasPermi="['stock:watchlist:add']" type="primary" :loading="adding" @click="handleAdd">加入自选</el-button></el-form-item>
      </el-form>
      <el-table v-loading="loading" :data="rows">
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
import { addWatchlist, listWatchlist, removeWatchlist } from '@/api/stock/watchlist'
export default {
  name: 'StockWatchlist',
  data() { return { loading: false, adding: false, rows: [], form: { stockCode: '', stockName: '' } } },
  created() { this.getList() },
  methods: {
    getList() { this.loading = true; listWatchlist().then(res => { this.rows = res.data || [] }).finally(() => { this.loading = false }) },
    handleAdd() {
      if (!this.form.stockCode.trim()) return this.$modal.msgWarning('请输入股票代码')
      this.adding = true
      addWatchlist(this.form).then(() => { this.$modal.msgSuccess('已加入自选'); this.form = { stockCode: '', stockName: '' }; this.getList() }).finally(() => { this.adding = false })
    },
    handleAnalyze(row) { this.$router.push({ path: '/stock/analyzer', query: { stockCode: row.stockCode } }) },
    handleRemove(row) { this.$modal.confirm('确认删除该自选股吗？').then(() => removeWatchlist(row.watchlistId)).then(() => { this.$modal.msgSuccess('删除成功'); this.getList() }).catch(() => {}) }
  }
}
</script>
