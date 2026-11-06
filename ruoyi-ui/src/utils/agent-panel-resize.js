export const PANEL_WIDTHS_KEY = 'orange-agent-panel-widths'
export const PANEL_LIMITS = { left: { min: 200, max: 420 }, right: { min: 320, max: 720 }, main: 320 }
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

export function parsePanelWidths(source) {
  const widths = { left: null, reports: null, subagent: null }
  try {
    const value = JSON.parse(source)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return widths
    Object.keys(widths).forEach(key => {
      const limits = key === 'left' ? PANEL_LIMITS.left : PANEL_LIMITS.right
      if (typeof value[key] === 'number' && Number.isFinite(value[key])) widths[key] = clamp(value[key], limits.min, limits.max)
    })
  } catch (_) { /* A corrupt or blocked storage entry should not affect the chat. */ }
  return widths
}

export function panelLayout(containerWidth, viewportWidth, rightKind, preferences = {}) {
  const width = Math.max(0, containerWidth)
  const rightDocked = Boolean(rightKind) && viewportWidth > 760 && width >= PANEL_LIMITS.right.min + PANEL_LIMITS.main
  const leftDocked = (!rightKind || rightDocked) && viewportWidth > (rightKind ? 1200 : 900)
    && width >= PANEL_LIMITS.left.min + PANEL_LIMITS.main + (rightDocked ? PANEL_LIMITS.right.min : 0)
  const defaultLeft = rightKind ? 220 : viewportWidth <= 1100 ? 245 : 268
  const defaultRight = rightKind === 'subagent' ? width * .44 : clamp(width * .34, 360, 440)
  const leftBudget = Math.min(PANEL_LIMITS.left.max, width - PANEL_LIMITS.main - (rightDocked ? PANEL_LIMITS.right.min : 0))
  const left = leftDocked ? clamp(preferences.left == null ? defaultLeft : preferences.left, PANEL_LIMITS.left.min, leftBudget) : 0
  const rightBudget = Math.min(PANEL_LIMITS.right.max, width - PANEL_LIMITS.main - left)
  const right = rightDocked ? clamp(preferences[rightKind] == null ? defaultRight : preferences[rightKind], PANEL_LIMITS.right.min, rightBudget) : 0
  return {
    leftDocked, rightDocked, left, right,
    leftMin: PANEL_LIMITS.left.min, leftMax: Math.max(PANEL_LIMITS.left.min, Math.min(PANEL_LIMITS.left.max, width - PANEL_LIMITS.main - right)),
    rightMin: PANEL_LIMITS.right.min, rightMax: Math.max(PANEL_LIMITS.right.min, rightBudget)
  }
}

export default {
  data() {
    let widths = null
    try { if (typeof window !== 'undefined') widths = window.localStorage.getItem(PANEL_WIDTHS_KEY) } catch (_) { /* Storage is optional. */ }
    return { panelWidthPreferences: parsePanelWidths(widths), panelContainerWidth: 0, panelViewportWidth: typeof window === 'undefined' ? 1280 : window.innerWidth, panelResizeDrag: null }
  },
  computed: {
    panelRightKind() { return this.selectedSubagentTool ? 'subagent' : this.canViewReports && this.reportsOpen ? 'reports' : '' },
    panelSizing() { return panelLayout(this.panelContainerWidth, this.panelViewportWidth, this.panelRightKind, this.panelWidthPreferences) },
    panelWidthStyle() { return { '--agent-left-panel-width': `${this.panelSizing.left}px`, '--agent-right-panel-width': `${this.panelSizing.right}px` } }
  },
  watch: {
    panelRightKind() { this.finishPanelResize(); this.$nextTick(() => this.measurePanelContainer()) }
  },
  mounted() { this.startPanelSizing() },
  activated() { this.startPanelSizing() },
  deactivated() { this.stopPanelSizing() },
  beforeDestroy() { this.stopPanelSizing() },
  methods: {
    startPanelSizing() {
      if (this._panelSizingActive) return
      this._panelSizingActive = true
      this.measurePanelContainer()
      window.addEventListener('resize', this.measurePanelContainer)
      window.addEventListener('blur', this.finishPanelResize)
      if (window.ResizeObserver) {
        this._panelSizingObserver = new window.ResizeObserver(this.measurePanelContainer)
        this._panelSizingObserver.observe(this.$el)
      }
    },
    stopPanelSizing() {
      this.finishPanelResize()
      if (!this._panelSizingActive) return
      this._panelSizingActive = false
      window.removeEventListener('resize', this.measurePanelContainer)
      window.removeEventListener('blur', this.finishPanelResize)
      if (this._panelSizingObserver) this._panelSizingObserver.disconnect()
      this._panelSizingObserver = null
    },
    measurePanelContainer() {
      const width = this.$el && this.$el.getBoundingClientRect().width
      const viewport = window.innerWidth
      if ((width !== this.panelContainerWidth || viewport !== this.panelViewportWidth) && this.panelResizeDrag) this.finishPanelResize()
      this.panelContainerWidth = width || 0
      this.panelViewportWidth = viewport
    },
    savePanelWidths() {
      try { window.localStorage.setItem(PANEL_WIDTHS_KEY, JSON.stringify(this.panelWidthPreferences)) } catch (_) { /* Resizing also works without persistence. */ }
    },
    setPanelWidth(side, value, persist = true) {
      if (!Number.isFinite(value)) return
      const left = side === 'left'
      const layout = this.panelSizing
      if (left ? !layout.leftDocked : !layout.rightDocked) return
      const key = left ? 'left' : this.panelRightKind
      const width = clamp(value, left ? layout.leftMin : layout.rightMin, left ? layout.leftMax : layout.rightMax)
      this.panelWidthPreferences = { ...this.panelWidthPreferences, [key]: Math.round(width) }
      if (persist) this.savePanelWidths()
    },
    resetPanelWidth(side) {
      this.finishPanelResize()
      const key = side === 'left' ? 'left' : this.panelRightKind
      if (!key) return
      this.panelWidthPreferences = { ...this.panelWidthPreferences, [key]: null }
      this.savePanelWidths()
    },
    startPanelResize(side, event) {
      this.finishPanelResize()
      this.measurePanelContainer()
      const layout = this.panelSizing
      if (side === 'left' ? !layout.leftDocked : !layout.rightDocked) return
      this.panelResizeDrag = { side, pointerId: event.pointerId, startX: event.clientX, startWidth: side === 'left' ? layout.left : layout.right, previous: { ...this.panelWidthPreferences } }
      this._panelDragElement = event.currentTarget
      document.documentElement.classList.add('agent-panels-resizing')
    },
    movePanelResize(event) {
      const drag = this.panelResizeDrag
      if (!drag || event.pointerId !== drag.pointerId) return
      const delta = (event.clientX - drag.startX) * (drag.side === 'left' ? 1 : -1)
      this.setPanelWidth(drag.side, drag.startWidth + delta, false)
    },
    finishPanelResize(event, cancel = false) {
      const drag = this.panelResizeDrag
      if (!drag || (event && event.pointerId != null && event.pointerId !== drag.pointerId)) return
      if (cancel) this.panelWidthPreferences = drag.previous
      const target = this._panelDragElement
      this.panelResizeDrag = null
      this._panelDragElement = null
      document.documentElement.classList.remove('agent-panels-resizing')
      if (target && target.hasPointerCapture && target.hasPointerCapture(drag.pointerId)) target.releasePointerCapture(drag.pointerId)
      this.savePanelWidths()
    },
    cancelPanelResize() { this.finishPanelResize(undefined, true) }
  }
}
