// Content growth must preserve the reader's decision to pause following.
export default {
  data() { return { userPinnedScroll: false, previousScrollTop: 0, scrollTouchY: null } },
  mounted() {
    this.chatResizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.scrollToBottom())
    this.observeChatContent()
  },
  updated() { this.observeChatContent() },
  beforeDestroy() { if (this.chatResizeObserver) this.chatResizeObserver.disconnect() },
  methods: {
    observeChatContent() {
      const content = this.$refs.messageContent
      if (!this.chatResizeObserver || content === this.chatObservedContent) return
      this.chatResizeObserver.disconnect()
      this.chatObservedContent = content
      if (content) this.chatResizeObserver.observe(content)
    },
    pauseAutoScroll() { this.userPinnedScroll = true },
    handleScrollWheel(event) { if (event.deltaY < 0) this.pauseAutoScroll() },
    handleScrollTouchStart(event) { this.scrollTouchY = event.touches[0] && event.touches[0].clientY },
    handleScrollTouchMove(event) {
      const y = event.touches[0] && event.touches[0].clientY
      if (y !== undefined && this.scrollTouchY !== null && y > this.scrollTouchY) this.pauseAutoScroll()
      this.scrollTouchY = y
    },
    handleScrollKey(event) {
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key) || (event.key === ' ' && event.shiftKey)) this.pauseAutoScroll()
    },
    handleConversationScroll() {
      const area = this.$refs.messageScroller
      if (!area) return
      if (area.scrollTop < this.previousScrollTop - 1) this.pauseAutoScroll()
      else if (area.scrollTop > this.previousScrollTop && area.scrollHeight - area.scrollTop - area.clientHeight <= 4) this.userPinnedScroll = false
      this.previousScrollTop = area.scrollTop
    },
    scrollToBottom(force = false) {
      const area = this.$refs.messageScroller
      if (!area || (!force && this.userPinnedScroll)) return
      area.scrollTop = area.scrollHeight
      this.previousScrollTop = area.scrollTop
      this.userPinnedScroll = false
    }
  }
}
