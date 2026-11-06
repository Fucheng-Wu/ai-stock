<template><div class="report-redirect">正在打开 Agent 助手中的报告中心…</div></template>
<script>
// Keep existing bookmarks working while the menu entry is hidden.
export default {
  name: 'AgentReports',
  created() { this.$router.replace({ path: '/agent-chat', query: { ...this.$route.query, panel: 'reports' } }) }
}
</script>
