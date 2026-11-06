<template>
  <div
    class="agent-panel-resizer" :class="['is-' + side, { 'is-dragging': dragging }]"
    role="separator" tabindex="0" aria-orientation="vertical" :aria-label="label" :aria-controls="controls"
    :aria-valuemin="Math.round(min)" :aria-valuemax="Math.round(max)" :aria-valuenow="Math.round(value)" :aria-valuetext="Math.round(value) + '像素'"
    title="左右拖动调整宽度，双击恢复默认"
    @pointerdown="start" @pointermove="$emit('move', $event)" @pointerup="$emit('end', $event)"
    @pointercancel="$emit('end', $event)" @lostpointercapture="$emit('end', $event)"
    @dblclick.prevent="$emit('reset')" @keydown="onKey"
  ><span aria-hidden="true" /></div>
</template>
<script>
export default {
  name: 'AgentPanelResizer',
  props: { side: String, label: String, controls: String, value: Number, min: Number, max: Number, dragging: Boolean },
  methods: {
    start(event) {
      if (event.button !== 0 || event.isPrimary === false) return
      event.preventDefault()
      if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(event.pointerId)
      this.$emit('start', event)
    },
    onKey(event) {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return
      event.preventDefault(); event.stopPropagation()
      if (event.key === 'Escape') { this.$emit('cancel'); return }
      if (event.key === 'Home' || event.key === 'End') { this.$emit('change', event.key === 'Home' ? this.min : this.max); return }
      const delta = (event.shiftKey ? 32 : 16) * (event.key === 'ArrowRight' ? 1 : -1) * (this.side === 'left' ? 1 : -1)
      this.$emit('change', this.value + delta)
    }
  }
}
</script>
<style lang="scss" scoped>
.agent-panel-resizer { position: absolute; z-index: 6; top: 0; bottom: 0; width: 8px; touch-action: none; cursor: col-resize; outline: none; &.is-left { right: -4px; } &.is-right { left: -4px; } &::before { content: ''; position: absolute; top: 0; bottom: 0; left: 3px; width: 2px; border-radius: 2px; background: var(--agent-link, #4d6bfe); opacity: 0; transition: opacity .15s; } > span { position: absolute; left: 3px; top: calc(50% - 14px); width: 2px; height: 28px; border-radius: 3px; background: var(--agent-link, #4d6bfe); opacity: .3; } &:hover, &:focus-visible, &.is-dragging { &::before { opacity: .65; } > span { opacity: 1; } } }
</style>
<style>
.agent-panels-resizing, .agent-panels-resizing * { cursor: col-resize !important; user-select: none !important; }
</style>
