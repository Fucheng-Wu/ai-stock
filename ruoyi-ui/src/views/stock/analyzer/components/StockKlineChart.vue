<template>
  <el-card class="stock-card stock-kline-chart" shadow="never">
    <div slot="header" class="stock-card__header stock-kline-chart__header">
      <div>
        <h2 class="stock-card__title">近三个月日 K</h2>
        <p class="stock-card__description">日 K、MA5 / MA10 / MA20 与成交量</p>
      </div>
      <div class="stock-kline-chart__metadata">
        <span class="stock-badge">{{ `${klineData.length} 个交易日` }}</span>
        <span v-if="updatedAt" class="stock-kline-chart__updated-at">
          <i class="el-icon-time" /> 更新时间 {{ updatedAt }}
        </span>
      </div>
    </div>

    <div v-if="hasKlineData" ref="chart" class="stock-kline-chart__canvas" />
    <div v-else class="stock-kline-chart__empty">暂无 K 线数据</div>
  </el-card>
</template>

<script>
import * as echarts from 'echarts'
import { buildStockKlineOption } from '@/utils/stock-kline'

export default {
  name: 'StockKlineChart',
  props: {
    klineData: {
      type: Array,
      default: () => []
    },
    updatedAt: {
      type: String,
      default: ''
    }
  },
  data() {
    return {
      chart: null
    }
  },
  computed: {
    hasKlineData() {
      return this.klineData.length > 0
    }
  },
  watch: {
    klineData: {
      deep: true,
      handler() {
        this.$nextTick(() => this.renderChart())
      }
    }
  },
  mounted() {
    window.addEventListener('resize', this.handleResize)
    this.$nextTick(() => this.renderChart())
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.handleResize)
    this.disposeChart()
  },
  methods: {
    renderChart() {
      if (!this.hasKlineData) {
        this.disposeChart()
        return
      }

      const chartElement = this.$refs.chart
      if (!chartElement) return

      if (!this.chart) {
        this.chart = echarts.init(chartElement)
      }

      this.chart.setOption(buildStockKlineOption(this.klineData), true)
    },
    handleResize() {
      if (this.chart) {
        this.chart.resize()
      }
    },
    disposeChart() {
      if (this.chart) {
        this.chart.dispose()
        this.chart = null
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.stock-kline-chart__header {
  gap: 16px;
}

.stock-kline-chart__metadata {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  color: var(--stock-muted);
  font-size: 12px;
  text-align: right;
}

.stock-kline-chart__updated-at {
  white-space: nowrap;
}

.stock-kline-chart__canvas {
  height: 520px;
}

.stock-kline-chart__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  color: var(--stock-muted);
}

@media (max-width: 768px) {
  .stock-kline-chart__header,
  .stock-kline-chart__metadata {
    flex-wrap: wrap;
  }

  .stock-kline-chart__metadata {
    justify-content: flex-start;
    text-align: left;
  }

  .stock-kline-chart__updated-at {
    white-space: normal;
  }

  .stock-kline-chart__canvas {
    height: 420px;
  }
}
</style>
