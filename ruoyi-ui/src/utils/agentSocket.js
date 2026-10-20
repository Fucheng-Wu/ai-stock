const DEFAULT_AGENT_WS_PATH = '/agent-ws'

/**
 * Resolve the Agent Gateway endpoint at runtime.
 *
 * A relative path keeps the browser connection on the same origin, which is
 * important when the workbench is served through HTTPS. Deployments can still
 * provide an absolute ws:// or wss:// address through VUE_APP_AGENT_WS_URL.
 */
export function getAgentWebSocketUrl() {
  const configured = process.env.VUE_APP_AGENT_WS_URL || DEFAULT_AGENT_WS_PATH
  if (/^wss?:\/\//i.test(configured)) {
    return configured
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const path = configured.startsWith('/') ? configured : `/${configured}`
  return `${protocol}//${window.location.host}${path}`
}

export const AGENT_PROTOCOL_VERSION = 1

