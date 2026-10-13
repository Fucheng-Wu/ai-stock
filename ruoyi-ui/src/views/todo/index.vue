<template>
  <div class="todo-page">
    <div class="todo-ambient" aria-hidden="true">
      <span class="todo-ambient__blob todo-ambient__blob--1" />
      <span class="todo-ambient__blob todo-ambient__blob--2" />
      <span class="todo-ambient__blob todo-ambient__blob--3" />
      <span class="todo-ambient__blob todo-ambient__blob--4" />
    </div>

    <header class="todo-header">
      <div class="todo-header__text">
        <div class="todo-header__eyebrow">My Tasks</div>
        <h1 class="todo-header__title">待办清单</h1>
        <p class="todo-header__subtitle">只记录内容和分类，专注把每件小事做完</p>
      </div>
      <div class="todo-stats">
        <div class="todo-stat">
          <span class="todo-stat__value">{{ pendingCount }}</span>
          <span class="todo-stat__label">进行中</span>
        </div>
        <div class="todo-stat todo-stat--done">
          <span class="todo-stat__value">{{ doneCount }}</span>
          <span class="todo-stat__label">已完成</span>
        </div>
      </div>
    </header>

    <section class="todo-card todo-composer">
      <el-input
        v-model="form.content"
        class="todo-composer__input"
        maxlength="500"
        clearable
        placeholder="准备做点什么？按 Enter 快速添加"
        @keyup.enter.native="handleAdd"
      >
        <template slot="prefix">
          <i class="el-icon-edit-outline todo-composer__icon" />
        </template>
      </el-input>
      <el-select v-model="form.category" class="todo-composer__category" placeholder="选择分类">
        <el-option v-for="item in categories" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
      <el-button
        v-hasPermi="['todo:task:add']"
        class="todo-composer__submit"
        type="primary"
        icon="el-icon-plus"
        :loading="adding"
        @click="handleAdd"
      >添加待办</el-button>
    </section>

    <section class="todo-card todo-list-card">
      <div class="todo-toolbar">
        <div class="todo-tabs">
          <button
            v-for="tab in statusTabs"
            :key="tab.value"
            type="button"
            class="todo-tab"
            :class="{ 'is-active': statusFilter === tab.value }"
            @click="statusFilter = tab.value"
          >
            {{ tab.label }}
            <span class="todo-tab__count">{{ tab.count }}</span>
          </button>
        </div>
        <div class="todo-chips">
          <button
            v-for="item in categoryFilters"
            :key="item.value"
            type="button"
            class="todo-chip"
            :class="[chipClass(item), { 'is-active': categoryFilter === item.value }]"
            @click="categoryFilter = item.value"
          >{{ item.label }}</button>
        </div>
      </div>

      <div v-loading="loading" class="todo-list-wrap">
        <template v-if="groupedTasks.length">
          <section v-for="group in groupedTasks" :key="group.value" class="todo-group">
            <header class="todo-group__header">
              <span class="todo-group__dot" :class="'todo-group__dot--' + group.theme" />
              <span class="todo-group__title">{{ group.label }}</span>
              <span class="todo-group__count">{{ group.tasks.length }}</span>
            </header>
            <ul class="todo-list">
              <li
                v-for="task in group.tasks"
                :key="task.taskId"
                class="todo-item"
                :class="{ 'is-done': task.status === '1' }"
              >
                <div v-if="editingId === task.taskId" class="todo-edit">
                  <el-input
                    v-model="editForm.content"
                    class="todo-edit__input"
                    maxlength="500"
                    @keyup.enter.native="handleSaveEdit"
                  />
                  <el-select v-model="editForm.category" class="todo-edit__category">
                    <el-option v-for="item in categories" :key="item.value" :label="item.label" :value="item.value" />
                  </el-select>
                  <el-button type="primary" size="small" :loading="saving" @click="handleSaveEdit">保存</el-button>
                  <el-button size="small" @click="cancelEdit">取消</el-button>
                </div>
                <template v-else>
                  <button
                    type="button"
                    class="todo-check"
                    :class="{ 'is-checked': task.status === '1' }"
                    :disabled="togglingId === task.taskId"
                    :title="task.status === '1' ? '标记为未完成' : '标记为已完成'"
                    @click="handleToggle(task)"
                  >
                    <i v-if="task.status === '1'" class="el-icon-check" />
                  </button>
                  <p class="todo-item__content">{{ task.content }}</p>
                  <div class="todo-item__actions">
                    <el-button v-hasPermi="['todo:task:edit']" type="text" icon="el-icon-edit" @click="startEdit(task)">编辑</el-button>
                    <el-button
                      v-hasPermi="['todo:task:remove']"
                      type="text"
                      icon="el-icon-delete"
                      class="todo-action-danger"
                      @click="handleRemove(task)"
                    >删除</el-button>
                  </div>
                </template>
              </li>
            </ul>
          </section>
        </template>

        <div v-else-if="!loading" class="todo-empty">
          <i class="el-icon-tickets todo-empty__icon" />
          <div class="todo-empty__title">{{ emptyTitle }}</div>
          <p class="todo-empty__description">{{ emptyDescription }}</p>
        </div>
      </div>
    </section>
  </div>
</template>

<script>
import { addTodoTask, listTodoTasks, removeTodoTask, updateTodoTask } from '@/api/todo/task'

const ALL_CATEGORY = 'all'

const CATEGORIES = [
  { label: '工作', value: '工作', theme: 'work' },
  { label: '学习', value: '学习', theme: 'study' },
  { label: '生活', value: '生活', theme: 'life' }
]

export default {
  name: 'TodoList',
  data() {
    return {
      loading: false,
      adding: false,
      saving: false,
      togglingId: null,
      rows: [],
      form: { content: '', category: CATEGORIES[0].value },
      statusFilter: 'all',
      categoryFilter: ALL_CATEGORY,
      editingId: null,
      editForm: { content: '', category: CATEGORIES[0].value }
    }
  },
  computed: {
    categories() {
      return CATEGORIES
    },
    categoryFilters() {
      return [{ label: '全部', value: ALL_CATEGORY, theme: 'all' }].concat(CATEGORIES)
    },
    pendingCount() {
      return this.rows.filter(task => task.status !== '1').length
    },
    doneCount() {
      return this.rows.filter(task => task.status === '1').length
    },
    statusTabs() {
      return [
        { label: '全部', value: 'all', count: this.rows.length },
        { label: '进行中', value: 'pending', count: this.pendingCount },
        { label: '已完成', value: 'done', count: this.doneCount }
      ]
    },
    groupedTasks() {
      return this.categories
        .filter(category => this.categoryFilter === ALL_CATEGORY || category.value === this.categoryFilter)
        .map(category => ({
          value: category.value,
          label: category.label,
          theme: category.theme,
          tasks: this.rows.filter(task => {
            const statusMatched = this.statusFilter === 'all'
              || (this.statusFilter === 'pending' && task.status !== '1')
              || (this.statusFilter === 'done' && task.status === '1')
            return task.category === category.value && statusMatched
          })
        }))
        .filter(group => group.tasks.length > 0)
    },
    emptyTitle() {
      return this.rows.length === 0 ? '还没有待办' : '没有符合条件的待办'
    },
    emptyDescription() {
      return this.rows.length === 0
        ? '在上方输入内容和分类，添加第一条待办。'
        : '试试切换筛选条件，查看其他待办。'
    }
  },
  created() {
    this.getList()
  },
  methods: {
    chipClass(item) {
      return 'todo-chip--' + item.theme
    },
    getList() {
      this.loading = true
      return listTodoTasks().then(res => {
        this.rows = res.data || []
      }).finally(() => {
        this.loading = false
      })
    },
    handleAdd() {
      const content = this.form.content.trim()
      if (!content) {
        this.$modal.msgWarning('请输入待办内容')
        return
      }
      this.adding = true
      addTodoTask({ content, category: this.form.category }).then(() => {
        this.$modal.msgSuccess('已添加')
        this.form.content = ''
        return this.getList()
      }).finally(() => {
        this.adding = false
      })
    },
    handleToggle(task) {
      if (this.togglingId) return
      this.togglingId = task.taskId
      updateTodoTask({ taskId: task.taskId, status: task.status === '1' ? '0' : '1' }).then(() => {
        return this.getList()
      }).finally(() => {
        this.togglingId = null
      })
    },
    startEdit(task) {
      this.editingId = task.taskId
      this.editForm = { content: task.content, category: task.category }
    },
    cancelEdit() {
      this.editingId = null
    },
    handleSaveEdit() {
      const content = this.editForm.content.trim()
      if (!content) {
        this.$modal.msgWarning('请输入待办内容')
        return
      }
      this.saving = true
      updateTodoTask({ taskId: this.editingId, content, category: this.editForm.category }).then(() => {
        this.$modal.msgSuccess('已保存')
        this.editingId = null
        return this.getList()
      }).finally(() => {
        this.saving = false
      })
    },
    handleRemove(task) {
      this.$modal.confirm(`确认删除待办「${task.content}」吗？`).then(() => {
        return removeTodoTask(task.taskId)
      }).then(() => {
        this.$modal.msgSuccess('删除成功')
        if (this.editingId === task.taskId) this.editingId = null
        return this.getList()
      }).catch(() => {})
    }
  }
}
</script>

<style lang="scss" scoped>
.todo-page {
  --todo-primary: #0a84ff;
  --todo-primary-deep: #0066e0;
  --todo-text: rgba(28, 28, 30, 0.92);
  --todo-muted: rgba(60, 60, 67, 0.6);
  --todo-subtle: rgba(60, 60, 67, 0.36);
  --todo-glass-edge: rgba(255, 255, 255, 0.62);
  --todo-glass-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.72) 0%, rgba(255, 255, 255, 0.42) 100%);
  --todo-glass-shadow: 0 12px 36px rgba(31, 38, 135, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9);
  --todo-glass-blur: blur(26px) saturate(180%);

  position: relative;
  min-height: calc(100vh - 84px);
  padding: 24px;
  overflow: hidden;
  background: linear-gradient(180deg, #eaf2fd 0%, #f3eefb 46%, #ecf7f0 100%);
  color: var(--todo-text);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif;

  * {
    box-sizing: border-box;
  }
}

.todo-ambient {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.todo-ambient__blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(72px);
  will-change: transform;
}

.todo-ambient__blob--1 {
  top: -140px;
  left: -100px;
  width: 460px;
  height: 460px;
  background: radial-gradient(circle at 35% 35%, rgba(10, 132, 255, 0.5), rgba(10, 132, 255, 0) 70%);
  animation: todo-drift-a 20s ease-in-out infinite alternate;
}

.todo-ambient__blob--2 {
  top: -80px;
  right: -120px;
  width: 520px;
  height: 520px;
  background: radial-gradient(circle at 40% 40%, rgba(191, 90, 242, 0.4), rgba(191, 90, 242, 0) 70%);
  animation: todo-drift-b 24s ease-in-out infinite alternate;
}

.todo-ambient__blob--3 {
  bottom: -170px;
  left: 20%;
  width: 440px;
  height: 440px;
  background: radial-gradient(circle at 45% 45%, rgba(48, 209, 88, 0.32), rgba(48, 209, 88, 0) 70%);
  animation: todo-drift-c 26s ease-in-out infinite alternate;
}

.todo-ambient__blob--4 {
  right: 6%;
  bottom: -150px;
  width: 380px;
  height: 380px;
  background: radial-gradient(circle at 50% 50%, rgba(255, 159, 10, 0.3), rgba(255, 159, 10, 0) 70%);
  animation: todo-drift-a 22s ease-in-out infinite alternate-reverse;
}

@keyframes todo-drift-a {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(70px, 50px, 0) scale(1.12);
  }
}

@keyframes todo-drift-b {
  from {
    transform: translate3d(0, 0, 0) scale(1.05);
  }
  to {
    transform: translate3d(-60px, 60px, 0) scale(0.95);
  }
}

@keyframes todo-drift-c {
  from {
    transform: translate3d(0, 0, 0) scale(0.96);
  }
  to {
    transform: translate3d(40px, -50px, 0) scale(1.08);
  }
}

.todo-header,
.todo-card {
  position: relative;
  z-index: 1;
}

.todo-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}

.todo-header__eyebrow {
  margin-bottom: 6px;
  color: var(--todo-primary);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.todo-header__title {
  margin: 0;
  color: var(--todo-text);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.25;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
}

.todo-header__subtitle {
  margin: 7px 0 0;
  color: var(--todo-muted);
  font-size: 14px;
  line-height: 1.6;
}

.todo-stats {
  display: flex;
  flex-shrink: 0;
  gap: 10px;
}

.todo-stat {
  min-width: 100px;
  padding: 12px 16px;
  border: 1px solid var(--todo-glass-edge);
  border-radius: 20px;
  background: var(--todo-glass-bg);
  backdrop-filter: var(--todo-glass-blur);
  -webkit-backdrop-filter: var(--todo-glass-blur);
  box-shadow: var(--todo-glass-shadow);
  text-align: center;
}

.todo-stat__value {
  display: block;
  color: var(--todo-primary);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.todo-stat__label {
  display: block;
  margin-top: 2px;
  color: var(--todo-muted);
  font-size: 12px;
}

.todo-stat--done .todo-stat__value {
  color: #1a9e4a;
}

.todo-card {
  margin-bottom: 16px;
  border: 1px solid var(--todo-glass-edge);
  border-radius: 26px;
  background: var(--todo-glass-bg);
  backdrop-filter: var(--todo-glass-blur);
  -webkit-backdrop-filter: var(--todo-glass-blur);
  box-shadow: var(--todo-glass-shadow);
}

.todo-composer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
}

.todo-composer__input {
  flex: 1;
  min-width: 0;

  ::v-deep .el-input__inner {
    height: 46px;
    border: 1px solid rgba(255, 255, 255, 0.72);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.46);
    backdrop-filter: blur(18px) saturate(160%);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85), inset 0 -1px 0 rgba(255, 255, 255, 0.25);
    color: var(--todo-text);
    font-family: inherit;
    font-size: 15px;
    transition: border-color 0.25s, background 0.25s, box-shadow 0.25s;

    &::placeholder {
      color: var(--todo-subtle);
    }

    &:hover {
      border-color: rgba(255, 255, 255, 0.95);
      background: rgba(255, 255, 255, 0.6);
    }

    &:focus {
      border-color: rgba(10, 132, 255, 0.55);
      background: rgba(255, 255, 255, 0.72);
      box-shadow: 0 0 0 4px rgba(10, 132, 255, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.9);
    }
  }

  ::v-deep .el-input__prefix {
    display: flex;
    align-items: center;
  }
}

.todo-composer__icon {
  color: var(--todo-subtle);
  font-size: 17px;
}

.todo-composer__category {
  flex-shrink: 0;
  width: 136px;

  ::v-deep .el-input__inner {
    height: 46px;
    border: 1px solid rgba(255, 255, 255, 0.72);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.46);
    backdrop-filter: blur(18px) saturate(160%);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
    color: var(--todo-text);
    font-family: inherit;
    transition: border-color 0.25s, background 0.25s, box-shadow 0.25s;

    &:hover {
      border-color: rgba(255, 255, 255, 0.95);
      background: rgba(255, 255, 255, 0.6);
    }

    &:focus {
      border-color: rgba(10, 132, 255, 0.55);
      background: rgba(255, 255, 255, 0.72);
      box-shadow: 0 0 0 4px rgba(10, 132, 255, 0.15);
    }
  }
}

.todo-composer__submit {
  flex-shrink: 0;
  height: 46px;
  padding: 0 24px;
  border: none;
  border-radius: 16px;
  background: linear-gradient(180deg, #3ba0ff 0%, #0a7cff 55%, #0066e0 100%);
  box-shadow: 0 10px 24px rgba(10, 132, 255, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.55), inset 0 -1px 0 rgba(0, 0, 0, 0.08);
  color: #fff;
  font-weight: 600;
  letter-spacing: 0.01em;
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.22s, background 0.22s;

  &:hover,
  &:focus {
    background: linear-gradient(180deg, #47a6ff 0%, #1485ff 55%, #0070ea 100%);
    box-shadow: 0 12px 28px rgba(10, 132, 255, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.6);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0) scale(0.98);
  }
}

.todo-list-card {
  padding: 10px 18px 14px;
}

.todo-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 10px 0 14px;
  border-bottom: 1px solid rgba(60, 60, 67, 0.08);
}

.todo-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.34);
  backdrop-filter: blur(20px) saturate(160%);
  -webkit-backdrop-filter: blur(20px) saturate(160%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.todo-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 15px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--todo-muted);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  transition: background 0.22s, color 0.22s, box-shadow 0.22s, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);

  &:hover {
    color: var(--todo-text);
  }

  &.is-active {
    background: rgba(255, 255, 255, 0.92);
    color: var(--todo-text);
    box-shadow: 0 2px 10px rgba(31, 38, 135, 0.14), inset 0 1px 0 #fff;
    transform: translateY(-0.5px);
  }
}

.todo-tab__count {
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(120, 120, 128, 0.14);
  color: var(--todo-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
}

.todo-tab.is-active .todo-tab__count {
  background: var(--todo-primary);
  color: #fff;
}

.todo-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.todo-chip {
  padding: 6px 14px;
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75);
  color: var(--todo-muted);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  outline: none;
  transition: background 0.22s, color 0.22s, border-color 0.22s, box-shadow 0.22s, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);

  &:hover {
    color: var(--todo-primary);
    transform: translateY(-1px);
  }
}

.todo-chip--all.is-active {
  background: rgba(255, 255, 255, 0.92);
  color: var(--todo-text);
  box-shadow: 0 4px 12px rgba(31, 38, 135, 0.12), inset 0 1px 0 #fff;
}

.todo-chip--work.is-active {
  border-color: rgba(10, 132, 255, 0.4);
  background: rgba(10, 132, 255, 0.16);
  color: var(--todo-primary-deep);
  box-shadow: 0 4px 14px rgba(10, 132, 255, 0.18);
}

.todo-chip--study.is-active {
  border-color: rgba(191, 90, 242, 0.38);
  background: rgba(191, 90, 242, 0.16);
  color: #9637d9;
  box-shadow: 0 4px 14px rgba(191, 90, 242, 0.18);
}

.todo-chip--life.is-active {
  border-color: rgba(48, 209, 88, 0.4);
  background: rgba(48, 209, 88, 0.16);
  color: #1a9e4a;
  box-shadow: 0 4px 14px rgba(48, 209, 88, 0.18);
}

.todo-list-wrap {
  min-height: 140px;
}

.todo-group {
  margin-bottom: 6px;

  &:last-child {
    margin-bottom: 0;
  }
}

.todo-group__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 8px 8px;
}

.todo-group__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.45);
}

.todo-group__dot--work {
  background: linear-gradient(160deg, #4da3ff, #0a7cff);
}

.todo-group__dot--study {
  background: linear-gradient(160deg, #cb7bf5, #a63ee0);
}

.todo-group__dot--life {
  background: linear-gradient(160deg, #4ade80, #16a34a);
}

.todo-group__title {
  color: var(--todo-text);
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.todo-group__count {
  padding: 1px 8px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.5);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75);
  color: var(--todo-muted);
  font-size: 11px;
  font-weight: 600;
  line-height: 17px;
}

.todo-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 10px;
  border-bottom: 1px solid rgba(60, 60, 67, 0.08);
  border-radius: 16px;
  transition: background 0.2s;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.5);
  }
}

.todo-check {
  display: inline-flex;
  flex: 0 0 24px;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1.5px solid rgba(120, 120, 128, 0.32);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  outline: none;
  transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), background 0.22s, border-color 0.22s, box-shadow 0.22s;

  &:hover {
    border-color: rgba(10, 132, 255, 0.6);
    transform: scale(1.06);
  }

  &.is-checked {
    border-color: transparent;
    background: linear-gradient(160deg, #4ade80 0%, #22c55e 55%, #16a34a 100%);
    box-shadow: 0 6px 16px rgba(34, 197, 94, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.5);
  }

  &:disabled {
    cursor: wait;
    opacity: 0.6;
  }
}

.todo-item__content {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--todo-text);
  font-size: 14px;
  line-height: 1.6;
  transition: color 0.18s ease;
}

.todo-item.is-done .todo-item__content {
  color: var(--todo-subtle);
  text-decoration: line-through;
}

.todo-item__actions {
  display: flex;
  flex-shrink: 0;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.18s ease;

  ::v-deep .el-button {
    padding: 6px 4px;
    color: rgba(60, 60, 67, 0.55);
    font-weight: 500;
    transition: color 0.2s;

    &:hover {
      color: var(--todo-primary);
    }
  }

  ::v-deep .todo-action-danger {
    color: rgba(255, 59, 48, 0.75);

    &:hover {
      color: #ff3b30;
    }
  }
}

.todo-item:hover .todo-item__actions,
.todo-item:focus-within .todo-item__actions {
  opacity: 1;
}

.todo-edit {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;

  ::v-deep .el-input__inner {
    border: 1px solid rgba(255, 255, 255, 0.72);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(16px) saturate(150%);
    -webkit-backdrop-filter: blur(16px) saturate(150%);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
    color: var(--todo-text);
    font-family: inherit;
  }

  ::v-deep .el-input.is-focus .el-input__inner,
  ::v-deep .el-input__inner:focus {
    border-color: rgba(10, 132, 255, 0.55);
    box-shadow: 0 0 0 3.5px rgba(10, 132, 255, 0.14);
  }

  ::v-deep .el-button {
    border-radius: 12px;
  }

  ::v-deep .el-button--primary {
    border: none;
    background: linear-gradient(180deg, #3ba0ff 0%, #0a7cff 55%, #0066e0 100%);
    box-shadow: 0 6px 16px rgba(10, 132, 255, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.5);
    color: #fff;
  }

  ::v-deep .el-button--default {
    border-color: rgba(255, 255, 255, 0.72);
    background: rgba(255, 255, 255, 0.54);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
    color: var(--todo-muted);
  }
}

.todo-edit__input {
  flex: 1;
  min-width: 0;
}

.todo-edit__category {
  flex-shrink: 0;
  width: 116px;
}

.todo-empty {
  padding: 48px 20px;
  text-align: center;
}

.todo-empty__icon {
  margin-bottom: 14px;
  color: rgba(60, 60, 67, 0.3);
  font-size: 42px;
}

.todo-empty__title {
  color: var(--todo-text);
  font-size: 16px;
  font-weight: 600;
}

.todo-empty__description {
  max-width: 520px;
  margin: 8px auto 0;
  color: var(--todo-muted);
  font-size: 13px;
  line-height: 1.7;
}

@media (prefers-reduced-motion: reduce) {
  .todo-ambient__blob {
    animation: none;
  }
}

@media (hover: none) {
  .todo-item__actions {
    opacity: 1;
  }
}

@media (max-width: 768px) {
  .todo-page {
    min-height: calc(100vh - 50px);
    padding: 16px;
  }

  .todo-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .todo-composer {
    flex-wrap: wrap;
  }

  .todo-composer__input {
    flex: 1 1 100%;
  }

  .todo-composer__category {
    flex: 1;
    width: auto;
  }

  .todo-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .todo-edit {
    flex-wrap: wrap;
  }

  .todo-edit__input {
    flex: 1 1 100%;
  }
}
</style>
