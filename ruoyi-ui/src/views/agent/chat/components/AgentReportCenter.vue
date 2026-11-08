<template>
  <div class="reports-page" :class="{ 'is-dark': isDark }">
    <header class="reports-header">
      <div>
        <strong><i class="el-icon-alarm-clock" /> 报告中心</strong>
        <small>管理任务，阅读每一次洞察</small>
      </div>
      <button class="report-icon-button" type="button" aria-label="关闭报告中心" title="关闭报告中心" @click="$emit('close')"><i class="el-icon-close" /></button>
    </header>

    <div class="reports-actions">
      <el-button v-hasPermi="['agent:report:add']" size="small" type="primary" icon="el-icon-plus" @click="openCreate">新建报告任务</el-button>
      <button class="reports-ask" type="button" @click="$emit('ask', '请帮我安排一份定时报告。')"><i class="el-icon-chat-line-round" /> 通过对话安排</button>
    </div>

    <p v-if="health" class="reports-worker-state" :class="{ 'is-offline': !workerOnline }"><i :class="workerOnline ? 'el-icon-circle-check' : 'el-icon-warning-outline'" /> {{ workerOnline ? '执行器在线 · 北京时间' : !health.configured ? '执行器尚未配置，请联系管理员' : '执行器暂未连接，到点执行可能延迟，请检查网关' }}</p>

    <section v-show="!readerVisible" class="reports-workspace">
      <div class="reports-toolbar">
        <div class="reports-view-tabs" role="tablist" aria-label="查看内容">
          <button type="button" :class="{ active: view === 'reports' }" @click="switchView('reports')"><i class="el-icon-document" /> 我的报告</button>
          <button type="button" :class="{ active: view === 'tasks' }" @click="switchView('tasks')"><i class="el-icon-alarm-clock" /> 任务管理</button>
        </div>
        <el-button size="small" icon="el-icon-refresh" :loading="loading" @click="load()">刷新</el-button>
      </div>
      <div class="reports-filters">
        <div class="reports-kinds">
          <button v-for="item in kinds" :key="item.value" type="button" :class="{ active: kind === item.value }" @click="changeKind(item.value)">{{ item.label }}</button>
        </div>
        <el-input v-model="keyword" size="small" placeholder="搜索标题，按 Enter 查询" prefix-icon="el-icon-search" clearable @clear="search" @keyup.enter.native="search" />
      </div>

      <div v-if="loadError" class="reports-empty"><i class="el-icon-warning-outline" /><h3>暂时无法加载</h3><p>请检查连接，或稍后点击刷新。</p></div>
      <div v-else v-loading="loading" class="reports-content">
        <div v-if="!rows.length && !loading" class="reports-empty">
          <i :class="view === 'tasks' ? 'el-icon-alarm-clock' : 'el-icon-document'" />
          <h3>{{ keyword ? '没有找到匹配的内容' : view === 'tasks' ? '安排你的第一份报告' : '报告将在这里与你见面' }}</h3>
          <p>{{ view === 'tasks' ? '创建一次性或周期任务，也可以在 Agent 对话中描述你的需求。' : '任务执行后会自动保存报告；生成进度和失败原因也会在这里显示。' }}</p>
          <el-button v-if="view === 'reports' && !keyword" type="text" @click="switchView('tasks')">查看我的任务 <i class="el-icon-right" /></el-button>
        </div>

        <div v-if="view === 'reports'" class="reports-grid">
          <article v-for="report in rows" :key="report.runId" class="report-card" tabindex="0" @click="openReport(report)" @keydown.enter="openReport(report)">
            <div class="report-card__top"><span class="report-type"><i :class="report.scheduleType === 'once' ? 'el-icon-document' : 'el-icon-refresh'" /> {{ report.scheduleType === 'once' ? '一次性报告' : '定时报告' }}</span><el-tag size="mini" :type="statusType(report.status)">{{ statusLabel(report.status) }}</el-tag></div>
            <h3>{{ report.title }}</h3>
            <p class="report-card__time">计划时间 · {{ formatTime(report.scheduledAt) }}</p>
            <p v-if="report.error" class="report-card__error">{{ report.error }}</p>
            <div class="report-card__footer"><span>{{ report.triggerType === 'manual' ? '手动生成' : '按计划生成' }}</span><span>{{ report.status === 'succeeded' ? '阅读报告' : '查看详情' }} <i class="el-icon-right" /></span></div>
          </article>
        </div>

        <div v-else class="report-task-list">
          <article v-for="task in rows" :key="task.taskId" class="report-task">
            <div class="report-task__icon"><i :class="task.scheduleType === 'once' ? 'el-icon-date' : 'el-icon-alarm-clock'" /></div>
            <div class="report-task__body"><div class="report-task__title"><h3>{{ task.title }}</h3><el-tag size="mini" :type="taskWaiting(task) || task.scheduleMessage ? 'warning' : statusType(task.status)">{{ task.status === 'paused' ? '已暂停' : task.scheduleMessage ? '待日历更新' : taskWaiting(task) ? '待执行器就绪' : statusLabel(task.status) }}</el-tag></div><p class="report-task__prompt">{{ task.prompt }}</p><p class="report-task__schedule"><span>{{ scheduleLabel(task) }}</span><span>{{ taskWaiting(task) ? '已保存计划：' : '下次执行：' }}{{ task.status === 'paused' ? '已暂停' : task.nextRunAt ? formatTime(task.nextRunAt) : task.scheduleMessage ? '等待日历更新' : '无后续计划' }}</span></p><p v-if="task.scheduleMessage" class="report-task__waiting"><i class="el-icon-warning-outline" /> {{ task.scheduleMessage }}</p><p v-if="taskWaiting(task)" class="report-task__waiting"><i class="el-icon-warning-outline" /> {{ task.executionMessage }}</p></div>
            <div class="report-task__actions">
              <el-button v-hasPermi="['agent:report:edit']" type="text" :disabled="!!actionId" @click="openEdit(task)">编辑</el-button>
              <el-dropdown trigger="click" @command="action => taskAction(action, task)">
                <el-button type="text" :disabled="!!actionId">更多 <i class="el-icon-arrow-down" /></el-button>
                <el-dropdown-menu slot="dropdown" class="agent-report-popup" :class="{ 'is-dark': isDark }">
                  <el-dropdown-item v-if="canEdit" command="run" :disabled="task.status === 'paused' || task.executionReady === false">立即生成</el-dropdown-item>
                  <el-dropdown-item v-if="canEdit && task.status !== 'completed'" :command="task.status === 'paused' ? 'resume' : 'pause'">{{ task.status === 'paused' ? '恢复任务' : '暂停任务' }}</el-dropdown-item>
                  <el-dropdown-item command="detail">查看要求与ID</el-dropdown-item>
                  <el-dropdown-item v-if="canRemove" command="delete" divided>删除任务</el-dropdown-item>
                </el-dropdown-menu>
              </el-dropdown>
            </div>
          </article>
        </div>
      </div>
      <div class="reports-pagination"><span>共 {{ total }} {{ view === 'tasks' ? '个任务' : '份报告' }}</span><el-pagination small :current-page="page" :page-size="20" :pager-count="5" :total="total" layout="prev, pager, next" @current-change="changePage" /></div>
    </section>

    <el-dialog :title="form.taskId ? '编辑报告任务' : '新建报告任务'" :visible.sync="formVisible" width="600px" custom-class="report-form-dialog" :modal-append-to-body="false" :close-on-click-modal="false">
      <el-form ref="form" :model="form" :rules="rules" label-position="top">
        <el-form-item label="报告标题" prop="title"><el-input v-model="form.title" maxlength="100" show-word-limit placeholder="例如：每周股市趋势观察" /></el-form-item>
        <el-form-item label="报告要求" prop="prompt"><el-input v-model="form.prompt" type="textarea" :rows="5" maxlength="5000" show-word-limit placeholder="描述希望关注的市场、股票和分析内容。例如：查询我的最新持仓，汇总今日涨跌、重要消息、520指标及风险，注明行情时间与来源。" /></el-form-item>
        <el-form-item label="重复" prop="scheduleType"><el-radio-group v-model="form.scheduleType" class="report-repeat-options" @change="clearScheduleValidation"><el-radio-button v-for="option in repeatOptions" :key="option.value" :label="option.value">{{ option.label }}</el-radio-button></el-radio-group></el-form-item>
        <el-form-item v-if="form.scheduleType === 'once'" label="执行时间（北京时间）" prop="runAt"><el-date-picker v-model="form.runAt" :popper-class="popupClass" type="datetime" format="yyyy-MM-dd HH:mm" value-format="yyyy-MM-dd'T'HH:mm:ss" placeholder="选择未来的日期和时间" /></el-form-item>
        <div v-else class="report-time-fields">
          <el-form-item label="时间（北京时间）" prop="time"><el-time-picker v-model="form.time" :popper-class="popupClass" format="HH:mm" value-format="HH:mm" placeholder="选择时间" /></el-form-item>
        </div>
        <el-form-item v-if="form.scheduleType === 'workweek'" label="休息方式" prop="workweek"><el-radio-group v-model="form.workweek" class="report-workweek-options"><el-radio label="single">单休（周一至周六执行）</el-radio><el-radio label="double">双休（周一至周五执行）</el-radio></el-radio-group></el-form-item>
        <el-form-item v-if="form.scheduleType === 'custom'" label="选择星期（可多选）" prop="weekDays"><el-checkbox-group v-model="form.weekDays" class="report-weekdays"><el-checkbox-button v-for="(label, index) in weekDays" :key="index" :label="index + 1">{{ label.slice(2) }}</el-checkbox-button></el-checkbox-group></el-form-item>
        <p v-if="form.scheduleType === 'workday' || form.scheduleType === 'holiday'" class="report-form-note">{{ form.scheduleType === 'workday' ? '按中国大陆放假调休安排执行：跳过假期，包含周末补班日。' : '在放假日和普通周末执行，跳过调休补班日。' }}日历覆盖{{ calendarYearsLabel }}；未覆盖的年份等待日历更新。</p>
        <p v-if="form.scheduleType === 'workweek' || form.scheduleType === 'custom'" class="report-form-note">每周按所选星期重复，不随节假日或调休变化。</p>
      </el-form>
      <p class="report-form-note">报告自动保存在此页面。持仓在每次执行时重新查询；编辑从下次执行生效。</p>
      <span slot="footer"><el-button @click="formVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">{{ form.taskId ? '保存修改' : '创建任务' }}</el-button></span>
    </el-dialog>

    <el-dialog title="任务详情" :visible.sync="taskVisible" width="650px" custom-class="report-form-dialog" :modal-append-to-body="false">
      <template v-if="taskDetail"><h3>{{ taskDetail.title }}</h3><p>{{ scheduleLabel(taskDetail) }} · 北京时间</p><p v-if="taskDetail.scheduleMessage" class="report-task__waiting">{{ taskDetail.scheduleMessage }}</p><p class="report-id">ID：{{ taskDetail.taskId }}</p><p class="report-task-detail">{{ taskDetail.prompt }}</p></template>
    </el-dialog>

    <section v-if="readerVisible" class="report-reader" aria-label="报告阅读">
      <div class="report-reader__toolbar"><button type="button" class="reports-ask" @click="closeReader"><i class="el-icon-back" /> 返回列表</button><button type="button" class="report-icon-button" aria-label="刷新报告" :disabled="reading" @click="refreshReport()"><i :class="reading ? 'el-icon-loading' : 'el-icon-refresh'" /></button></div>
      <div v-loading="reading" class="report-reader__body">
        <el-alert v-if="readerError" :title="readerError" type="error" :closable="false" show-icon />
        <template v-if="selectedReport"><div class="report-reader__meta"><el-tag size="small" :type="statusType(selectedReport.status)">{{ statusLabel(selectedReport.status) }}</el-tag><span>{{ formatTime(selectedReport.scheduledAt) }} · 北京时间</span></div><h1>{{ selectedReport.title }}</h1><p class="report-reader__subtitle">{{ selectedReport.finishedAt ? '完成于 ' + formatTime(selectedReport.finishedAt) : '报告正在等待或执行中，页面会自动更新' }}</p>
          <el-alert v-if="selectedReport.error" :title="selectedReport.error" type="error" :closable="false" show-icon />
          <agent-markdown v-if="selectedReport.content" :text="selectedReport.content" />
          <el-empty v-else :description="selectedReport.status === 'failed' || selectedReport.status === 'cancelled' ? '本次未生成报告正文' : '报告完成后将显示在这里'" />
          <details class="report-requirements"><summary>查看本次报告要求</summary><p>{{ selectedReport.prompt }}</p><span class="report-id">报告ID：{{ selectedReport.runId }}</span></details>
          <div class="report-reader__actions"><div v-if="selectedReport.content" class="report-reader__downloads"><el-button size="small" type="primary" icon="el-icon-download" :loading="exportingHtml" @click="downloadHtmlReport">导出 HTML</el-button></div><el-button v-if="canRemove && !['running', 'queued'].includes(selectedReport.status)" type="text" :disabled="!!actionId" @click="removeReport">删除这份报告</el-button></div>
        </template>
      </div>
    </section>
  </div>
</template>

<script>
import { getReportHealth, listReportTasks, getReportTask, createReportTask, updateReportTask, changeReportTaskStatus, deleteReportTask, runReportTask, listReports, getReport, deleteReport } from '@/api/agent/reports'
import AgentMarkdown from './AgentMarkdown.vue'
import { buildReportHtml, reportDownloadName } from '@/utils/agent-report-export'
import { REPORT_REPEAT_OPTIONS, REPORT_WEEK_DAYS, reportScheduleLabel, reportScheduleForm, reportSchedulePayload } from '@/utils/agent-report-schedule'

function requestKey() { return 'report-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) }
const emptyForm = () => ({ taskId: null, title: '', prompt: '', scheduleType: 'once', runAt: '', weekDays: [], workweek: 'double', time: '09:00', version: null, requestKey: requestKey() })
export default {
  name: 'AgentReportCenter',
  inject: { agentAppearance: { default: null } },
  components: { AgentMarkdown },
  data() {
    return {
      view: 'reports', kind: 'all', keyword: '', page: 1, total: 0, rows: [], loading: false, loadError: false,
      kinds: [{ value: 'all', label: '全部' }, { value: 'once', label: '一次性报告' }, { value: 'recurring', label: '定时报告' }],
      weekDays: REPORT_WEEK_DAYS, repeatOptions: REPORT_REPEAT_OPTIONS,
      formVisible: false, saving: false, form: emptyForm(), actionId: null, taskVisible: false, taskDetail: null,
      readerVisible: false, selectedReport: null, reading: false, readerError: '', refreshTimer: null, loadSequence: 0, readSequence: 0,
      health: null, exportingHtml: false,
      rules: {
        title: [{ required: true, whitespace: true, message: '请输入报告标题', trigger: 'blur' }],
        prompt: [{ required: true, whitespace: true, message: '请输入报告要求', trigger: 'blur' }],
        runAt: [{ required: true, message: '请选择执行时间', trigger: 'change' }],
        time: [{ required: true, message: '请选择时间', trigger: 'change' }],
        weekDays: [{ type: 'array', required: true, min: 1, message: '请至少选择一个星期', trigger: 'change' }],
        workweek: [{ required: true, message: '请选择单休或双休', trigger: 'change' }]
      }
    }
  },
  computed: {
    isDark() { return this.agentAppearance && this.agentAppearance.theme === 'dark' },
    popupClass() { return 'agent-report-popup' + (this.isDark ? ' is-dark' : '') },
    overlayClass() { return 'agent-report-overlay' + (this.isDark ? ' is-dark' : '') },
    canEdit() { const p = this.$store.getters.permissions; return p.includes('*:*:*') || p.includes('agent:report:edit') },
    canRemove() { const p = this.$store.getters.permissions; return p.includes('*:*:*') || p.includes('agent:report:remove') },
    workerOnline() { return this.health && this.health.configured && this.health.lastSeenAt > Date.now() - 120000 },
    calendarYearsLabel() { return this.health && this.health.calendarYears ? this.health.calendarYears.join('、') + '年' : '以服务端配置为准' }
  },
  activated() { this.startRefresh() },
  mounted() { this.startRefresh() },
  deactivated() { this.stopRefresh() },
  beforeDestroy() { this.stopRefresh(); this.loadSequence++; this.readSequence++ },
  methods: {
    startRefresh() {
      if (this.refreshTimer) return
      this.load()
      this.refreshTimer = setInterval(() => {
        if (document.hidden || this.formVisible || this.saving || this.actionId) return
        this.load(true)
        if (this.readerVisible && this.selectedReport && ['queued', 'running'].includes(this.selectedReport.status)) this.refreshReport()
      }, 15000)
    },
    stopRefresh() { clearInterval(this.refreshTimer); this.refreshTimer = null },
    async load(quiet = false) {
      const sequence = ++this.loadSequence
      if (!quiet) this.loading = true
      try {
        const [response, health] = await Promise.all([
          (this.view === 'tasks' ? listReportTasks : listReports)({ kind: this.kind, keyword: this.keyword.trim(), page: this.page, pageSize: 20 }), getReportHealth()
        ])
        if (sequence !== this.loadSequence) return
        this.rows = response.data.rows; this.total = response.data.total; this.loadError = false
        this.health = health.data
        if (!this.rows.length && this.page > 1) { this.page--; this.load(quiet) }
      } catch (_) { if (sequence === this.loadSequence) this.loadError = true }
      finally { if (sequence === this.loadSequence) this.loading = false }
    },
    switchView(view) { this.view = view; this.page = 1; this.rows = []; this.load() },
    changeKind(kind) { this.kind = kind; this.page = 1; this.load() },
    changePage(page) { this.page = page; this.load() },
    search() { this.page = 1; this.load() },
    taskWaiting(task) { return task.status === 'enabled' && task.executionReady === false },
    statusLabel(status) { return { enabled: '已启用', paused: '已暂停', completed: '已触发', queued: '等待生成', running: '正在生成', succeeded: '已完成', failed: '生成失败', cancelled: '已取消' }[status] || status },
    statusType(status) { return { enabled: 'success', paused: 'info', completed: 'info', queued: 'warning', running: '', succeeded: 'success', failed: 'danger', cancelled: 'info' }[status] || '' },
    formatTime(value) { return value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(Number(value)) : '—' },
    scheduleLabel: reportScheduleLabel,
    clearScheduleValidation() { this.$nextTick(() => this.$refs.form && this.$refs.form.clearValidate()) },
    openCreate() { this.form = emptyForm(); this.formVisible = true; this.$nextTick(() => this.$refs.form.clearValidate()) },
    async openEdit(task) {
      try {
        const { data } = await getReportTask(task.taskId)
        this.form = { ...emptyForm(), ...reportScheduleForm(data) }
        this.formVisible = true; this.$nextTick(() => this.$refs.form.clearValidate())
      } catch (_) { /* request layer displays errors */ }
    },
    save() {
      this.$refs.form.validate(async valid => {
        if (!valid || this.saving) return
        this.saving = true
        const data = reportSchedulePayload(this.form)
        try {
          const response = this.form.taskId ? await updateReportTask(this.form.taskId, data) : await createReportTask(data)
          this.formVisible = false
          if (response.data && response.data.scheduleMessage) this.$message.warning(response.data.scheduleMessage)
          else if (response.data && response.data.executionReady === false) this.$message.warning('任务已保存，执行器尚未就绪，暂不能执行')
          else this.$message.success('任务已保存，时间按北京时间执行')
          this.switchView('tasks')
        } catch (_) { /* preserve form and requestKey for recovery */ }
        finally { this.saving = false }
      })
    },
    async taskAction(action, task) {
      if (this.actionId) return
      this.actionId = task.taskId
      try {
        if (action === 'detail') { const { data } = await getReportTask(task.taskId); this.taskDetail = data; this.taskVisible = true; return }
        if (action === 'delete') {
          await this.$confirm('删除“' + task.title + '”及其后续执行？正在执行的报告也会取消，已有报告仍保留。', '删除报告任务', { type: 'warning', customClass: this.overlayClass })
          await deleteReportTask(task.taskId, task.version)
        } else if (action === 'run') {
          await runReportTask(task.taskId, requestKey()); this.$message.success('已加入生成队列，请在“我的报告”查看进度')
        } else {
          if (action === 'pause') await this.$confirm('暂停后将取消等待中及正在生成的报告，确定暂停？', '暂停任务', { customClass: this.overlayClass })
          await changeReportTaskStatus(task.taskId, { action, version: task.version })
        }
        this.load()
      } catch (_) { /* confirmation cancellation and request errors are already handled */ }
      finally { this.actionId = null }
    },
    closeReader() { this.readerVisible = false; this.selectedReport = null; this.readerError = ''; this.readSequence++ },
    async openReport(report) { this.selectedReport = null; this.readerError = ''; this.readerVisible = true; await this.refreshReport(report.runId) },
    async refreshReport(id) {
      const sequence = ++this.readSequence
      id = id || (this.selectedReport && this.selectedReport.runId)
      if (!id) return
      this.reading = true; this.readerError = ''
      try { const { data } = await getReport(id); if (sequence === this.readSequence && this.readerVisible) this.selectedReport = data }
      catch (_) { if (sequence === this.readSequence) this.readerError = '报告暂时无法加载，请返回列表后重试。' }
      finally { if (sequence === this.readSequence) this.reading = false }
    },
    async removeReport() {
      if (this.actionId || !this.selectedReport) return
      this.actionId = this.selectedReport.runId
      try {
        await this.$confirm('删除这份报告？对应的任务仍会按计划运行。', '删除报告', { type: 'warning', customClass: this.overlayClass })
        await deleteReport(this.selectedReport.runId); this.closeReader(); this.load()
      } catch (_) { /* request layer displays errors */ }
      finally { this.actionId = null }
    },
    async downloadHtmlReport() {
      if (this.exportingHtml || !this.selectedReport || !this.selectedReport.content) return
      const report = { ...this.selectedReport }
      this.exportingHtml = true
      try {
        await this.$nextTick()
        this.saveDownload(buildReportHtml(report), 'text/html;charset=utf-8', reportDownloadName(report.title, 'html'))
      } catch (error) { this.$message.error(error.message || 'HTML导出失败，请重试') }
      finally { this.exportingHtml = false }
    },
    saveDownload(content, mimeType, filename) {
      const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
      const link = document.createElement('a'); link.href = url; link.download = filename; link.style.display = 'none'
      document.body.appendChild(link)
      try { link.click() }
      finally { document.body.removeChild(link); setTimeout(() => URL.revokeObjectURL(url), 1000) }
    }
  }
}
</script>

<style lang="scss" scoped>
.reports-page { display: flex; flex: 1; min-width: 0; min-height: 0; flex-direction: column; box-sizing: border-box; line-height: 1.5; color: var(--agent-text, #374151); background: var(--agent-background, #fff); * { box-sizing: border-box; } }
.reports-header { display: flex; min-height: 78px; flex: 0 0 78px; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--agent-line, #e5e7eb); strong { display: block; font-size: 14px; color: var(--agent-text-primary, #111827); font-weight: 600; > i { margin-right: 5px; color: var(--agent-link, #4d6bfe); } } small { display: block; margin-top: 7px; font-size: 10px; color: var(--agent-subtle, #9ca3af); } }
.report-icon-button { display: inline-grid; width: 30px; height: 30px; flex: 0 0 30px; place-items: center; border: 0; border-radius: 7px; background: transparent; color: var(--agent-muted, #6b7280); cursor: pointer; &:hover { background: var(--agent-hover, #f3f4f6); } &:disabled { opacity: .5; cursor: default; } }
.reports-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 20px 18px 12px; .el-button { border-radius: 8px; } }
.reports-ask { padding: 0; border: 0; background: none; color: var(--agent-link, #4d6bfe); font-size: 11px; line-height: 1.8; cursor: pointer; }
.reports-worker-state { flex-shrink: 0; font-size: 10px; color: var(--agent-subtle, #9ca3af); margin: 0 20px 14px; line-height: 1.6; i { margin-right: 5px; } &.is-offline { color: #bd9366; } }
.reports-workspace { display: flex; flex: 1; min-height: 0; flex-direction: column; overflow: hidden; }
.reports-toolbar { display: flex; flex-shrink: 0; align-items: center; justify-content: space-between; padding: 0 18px; border-bottom: 1px solid var(--agent-line, #e5e7eb); > .el-button { border: 0; color: var(--agent-muted, #6b7280); background: transparent; font-size: 11px; padding: 8px; } }
.reports-view-tabs { display: flex; gap: 22px; button { padding: 13px 0; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--agent-muted, #6b7280); font-size: 12px; cursor: pointer; &.active { border-bottom-color: var(--agent-link, #4d6bfe); color: var(--agent-link, #4d6bfe); font-weight: 600; } > i { margin-right: 3px; } } }
.reports-filters { display: flex; flex-shrink: 0; flex-direction: column; gap: 12px; padding: 16px 18px; .el-input { width: 100%; } }
.reports-kinds { display: flex; gap: 4px; padding: 3px; border-radius: 8px; background: var(--agent-surface, #f3f4f6); button { flex: 1; padding: 7px 3px; border: 0; border-radius: 6px; background: transparent; color: var(--agent-muted, #6b7280); font-size: 11px; cursor: pointer; &.active { color: var(--agent-link, #4d6bfe); background: var(--agent-background, #fff); box-shadow: 0 1px 5px #19265310; } } }
.reports-content { min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 0 18px 18px; }
.reports-grid { display: grid; grid-template-columns: minmax(0,1fr); gap: 12px; }
.report-card { padding: 16px; border: 1px solid var(--agent-line, #e5e7eb); border-radius: 10px; cursor: pointer; transition: border-color .18s; &:hover, &:focus-visible { border-color: var(--agent-focus, #b9c7ff); } h3 { margin: 14px 0 9px; color: var(--agent-text-primary, #111827); font-size: 14px; font-weight: 600; line-height: 1.7; overflow-wrap: anywhere; } }
.report-card__top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.report-type { color: var(--agent-subtle, #9ca3af); font-size: 10px; i { margin-right: 3px; } }
.report-card__time { color: var(--agent-subtle, #9ca3af); font-size: 10px; }
.report-card__error { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--agent-error, #b91c1c); font-size: 11px; }
.report-card__footer { display: flex; justify-content: space-between; margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--agent-line, #e5e7eb); color: var(--agent-subtle, #9ca3af); font-size: 10px; span:last-child { color: var(--agent-link, #4d6bfe); } }
.report-task { display: flex; flex-wrap: wrap; gap: 10px; padding: 17px 0; border-bottom: 1px solid var(--agent-line, #e5e7eb); &:last-child { border: 0; } }
.report-task__icon { display: none; }
.report-task__body { min-width: 0; flex: 1 0 100%; }
.report-task__title { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; h3 { margin: 0; color: var(--agent-text-primary, #111827); font-size: 13px; font-weight: 600; line-height: 1.8; overflow-wrap: anywhere; } }
.report-task__prompt { margin: 8px 0 11px; color: var(--agent-muted, #6b7280); font-size: 11px; line-height: 1.8; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.report-task__schedule { display: flex; flex-direction: column; gap: 6px; margin: 0; font-size: 10px; color: var(--agent-subtle, #9ca3af); span:first-child { color: var(--agent-link, #4d6bfe); } }
.report-task__waiting { margin: 10px 0 0; font-size: 10px; line-height: 1.7; color: #bd9366; }
.report-task__actions { display: flex; width: 100%; align-items: center; justify-content: flex-end; gap: 18px; .el-button { padding: 4px 0; font-size: 11px; } }
.reports-empty { flex: 1; padding: 40px 10px; text-align: center; > i { display: block; font-size: 32px; color: var(--agent-subtle, #9ca3af); opacity: .6; } h3 { font-size: 14px; font-weight: 500; margin: 18px 0 12px; } p { color: var(--agent-muted, #6b7280); font-size: 11px; line-height: 1.9; } }
.reports-pagination { display: flex; flex-shrink: 0; justify-content: space-between; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--agent-line, #e5e7eb); > span { flex-shrink: 0; font-size: 10px; color: var(--agent-subtle, #9ca3af); } ::v-deep .el-pagination { padding: 0; button, li { min-width: 23px; color: var(--agent-muted, #6b7280); background: transparent; } .active { color: var(--agent-link, #4d6bfe); } } }
.report-time-fields { display: flex; gap: 20px; .el-form-item { flex: 1; min-width: 0; } .el-select,.el-date-editor { width: 100%; } }
.report-repeat-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; width: 100%; ::v-deep .el-radio-button__inner { width: 100%; border: 1px solid var(--agent-line, #e5e7eb); border-radius: 7px !important; box-shadow: none !important; padding: 11px 5px; } }
.report-workweek-options { display: flex; flex-wrap: wrap; gap: 14px; ::v-deep .el-radio { margin-right: 0; color: var(--agent-text, #374151); } }
.report-weekdays { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; ::v-deep .el-checkbox-button__inner { width: 100%; padding: 10px 0; border: 1px solid var(--agent-line, #e5e7eb); border-radius: 6px !important; box-shadow: none !important; } }
.is-dark .report-weekdays { ::v-deep .el-checkbox-button__inner { background: var(--agent-surface); color: var(--agent-muted); } ::v-deep .is-checked .el-checkbox-button__inner { background: var(--agent-solid-accent, #4d6bfe); color: #fff; } }
.report-form-note { font-size: 12px; line-height: 1.8; color: var(--agent-subtle, #9ca3af); }
.report-task-detail { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.9; color: var(--agent-text, #374151); }
.report-id { font-size: 10px; color: var(--agent-subtle, #9ca3af); overflow-wrap: anywhere; }
.report-reader { display: flex; flex: 1; min-height: 0; flex-direction: column; }
.report-reader__toolbar { display: flex; flex-shrink: 0; align-items: center; justify-content: space-between; padding: 10px 18px; border-top: 1px solid var(--agent-line, #e5e7eb); border-bottom: 1px solid var(--agent-line, #e5e7eb); }
.report-reader__body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 22px 20px 32px; > h1 { font-size: 21px; line-height: 1.6; overflow-wrap: anywhere; } .el-alert { margin-bottom: 20px; } ::v-deep .agent-rich-content { font-size: 13px; } }
.report-reader__meta { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; font-size: 10px; color: var(--agent-subtle, #9ca3af); }
.report-reader__subtitle { color: var(--agent-subtle, #9ca3af); font-size: 10px; line-height: 1.8; margin-bottom: 24px; }
.report-requirements { margin-top: 28px; border-top: 1px solid var(--agent-line, #e5e7eb); padding: 18px 0; font-size: 11px; color: var(--agent-muted, #6b7280); summary { cursor: pointer; } p { white-space: pre-wrap; line-height: 1.8; overflow-wrap: anywhere; } }
.report-reader__actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; }
.report-reader__downloads { display: flex; flex-wrap: wrap; gap: 8px; .el-button + .el-button { margin-left: 0; } }
::v-deep .el-input__inner, ::v-deep .el-textarea__inner { background: var(--agent-background, #fff); color: var(--agent-text, #374151); border-color: var(--agent-line, #e5e7eb); }
::v-deep .el-loading-mask { background: var(--agent-background-transparent, #ffffffbb); }
::v-deep .el-button--primary { background: var(--agent-solid-accent, #4d6bfe); border-color: var(--agent-solid-accent, #4d6bfe); color: #fff; }
::v-deep .el-button--text { color: var(--agent-link, #4d6bfe); }
::v-deep .report-form-dialog { max-width: calc(100vw - 28px); border-radius: 12px; background: var(--agent-background, #fff); .el-dialog__title, .el-dialog__body, .el-form-item__label { color: var(--agent-text, #374151); } .el-button:not(.el-button--primary):not(.el-button--text) { background: var(--agent-surface, #f3f4f6); border-color: var(--agent-line, #e5e7eb); color: var(--agent-text, #374151); } }
.is-dark { ::v-deep .el-radio-button__inner { background: var(--agent-surface); border-color: var(--agent-line); color: var(--agent-muted); } ::v-deep .el-radio-button__orig-radio:checked + .el-radio-button__inner { background: var(--agent-solid-accent, #4d6bfe); color: #fff; } ::v-deep .el-tag { background: var(--agent-surface); border-color: var(--agent-line); color: var(--agent-link); } ::v-deep .el-tag--danger { color: var(--agent-error); } ::v-deep .el-tag--success { color: var(--agent-success); } }
@media (max-width: 760px) { .reports-header { min-height: 66px; flex-basis: 66px; } }
@media (max-width: 600px) { .report-time-fields { flex-wrap: wrap; } ::v-deep .report-form-dialog { margin-top: 5vh !important; width: calc(100% - 28px) !important; } }
</style>
<style lang="scss">
.agent-report-popup.is-dark, .agent-report-overlay.is-dark { background: #37383d; border-color: #494b52; color: #d4d6dd; .el-dropdown-menu__item, .el-select-dropdown__item, .el-message-box__title, .el-message-box__content, .el-picker-panel__body, .el-picker-panel__icon-btn, .el-date-picker__header-label { color: #d4d6dd; } .el-dropdown-menu__item:hover, .el-select-dropdown__item.hover { background: #414d72; color: #a1b4ff; } .el-button:not(.el-button--primary), .el-input__inner, .el-time-panel__footer { background: #303135; color: #d4d6dd; border-color: #494b52; } .el-picker-panel__footer, .el-picker-panel__body, .el-time-spinner__item { background: #37383d; color: #d4d6dd; } .el-time-spinner__item.active { color: #a1b4ff; } }
</style>
