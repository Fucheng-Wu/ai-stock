# Upstream synchronization

The embedded backend is synchronized with:

- Source: `C:\Users\orange\Desktop\study\pi\pi-agent-gateway`
- Branch: `main`
- Original baseline: `94d9d752f2ada9145454e967c1721cfe68bf685e`
- Latest selectively adapted commit: `0217a7f4aa0d076870e674bdd1d73547853a6c48`
- Commit subject: `feat: add live subagent split view and improve chat streaming UX`
- Commit date: `2026-10-25 20:26:18 +0800`

## Changes adapted from 0217a7f

- Child conversation snapshots (thinking, text, business tools and errors) are streamed at an
  80 ms maximum update frequency and attached to the parent Agent tool result. Successful and
  failed runs retain their details through transcript conversion, JSONL and MySQL recovery.
- The existing workbench tool-progress map carries child snapshots through reconnects and
  intermediate parent message replacement; no additional unrestricted role is introduced.
- Vue 2 subagent split view, per-call selection, close controls, mobile overlay and a legacy
  result fallback for historical calls that did not record child details.
- Collapsible tool execution groups and user-intent scroll following in both chat panes.
  ResizeObserver follows growing content only while the reader has not paused it.
- Light/dark chat themes, browser-local preference persistence (`orange-agent-theme`), shared
  component color tokens and ECharts theme recreation. Theme variables are scoped to the Agent
  page and its permission dialog; other workbench menus keep their existing appearance.
- Workbench-specific fixes for global RuoYi aside styles, incomplete assistant replacement,
  theme-aware chart backgrounds and exports. Explicit chart backgrounds are preserved.

Upstream `backend/subagents` contains no new stock role or tool implementation in this revision.
The workbench's stock-analyst, trusted stock skills, token forwarding, restricted primary/child
roles and exact execution allowlists remain integration-specific.

Validation: backend typecheck and 18 tests (including the real SDK, live child reconnect snapshots
and database-record recovery); 37 frontend tests; production build; browser checks for split view,
child updates, paused scrolling, theme persistence, chart theme and mobile layouts.

## Changes adapted from 18ab3ee

- Exhaustive command payload validation in `shared/validation.ts`, extended for workbench login,
  title search, pagination, and renaming; malformed requests retain a valid requestId in errors.
- One-time broadcast encoding and an 8 MiB outgoing WebSocket backpressure limit. Slow clients
  reconnect and reload user-scoped snapshots instead of accumulating an unbounded queue.
- Session epoch/sequence metadata, duplicate filtering, bounded pending-event replay, stale
  snapshot rejection, and resynchronization after missing events or an SDK session reload.
- Snapshots additionally include the currently streaming assistant and partial tool results,
  so an authoritative sequence cannot discard text that is not yet in the durable transcript.
- Non-prompt command acknowledgements; prompts keep the workbench's `prompt_accepted`
  acknowledgement after persistence, rather than confirming before the prompt is accepted.
- Parallel cancellation with a 5-second wait for active operations during shutdown, interactive
  authentication cleanup, final MySQL persistence, and termination of lingering connections.
- Vue 2 equivalents of Markdown rendering throttling and bounded tool-output previews.
  The workbench chat uses a DeepSeek-style blue/white palette, responsive layout, and tool cards.

Workspace selection/browsing and run reviews are deliberately excluded: they inspect internal
directories and file diffs and do not match the restricted stock assistant. The standalone Vite
frontend, client SDK, diff dependency, and upstream coding roles are not copied into the workbench.

## Changes retained from 94d9d75

This update incorporates upstream's scoped session approvals, matching pending-request resolution,
batch rejection, multiline wildcard matching, and separate operation/directory permission checks.
The Vue 2 chat adapts upstream's live thinking panel (auto-open, follow latest, manual collapse,
and collapse when answer text starts) and permission dialog with explicit approval scopes.
The workbench's exact tool allowlists are checked before these approval rules; upstream Build's
broader default permissions and ambient custom roles are intentionally not enabled.

The following integration-specific changes are intentionally maintained on top of upstream:

- MySQL session persistence in `backend/src/lib/database.ts`;
- ownership checks on history, actions and event delivery, plus the separate `agent:chat:manage`
  permission for gateway configuration;
- persistence and recovery hooks in `index.ts`, `session-factory.ts`, `event-relay.ts`, and `types.ts`;
- project-local `.env` configuration and start scripts;
- the RuoYi Vue 2 interface replaces upstream's standalone Vite frontend.
- default DeepSeek model selection and per-prompt stock authentication;
- one restricted primary role (`general`) and one stock-only subagent (`stock-analyst`),
  replacing upstream's coding-oriented Build/Plan and general-purpose child roles;
- exact tool allowlists in `agent-policy.ts` and execution guards in `permissions.ts`;
- stock business tools, Tavily public search, and server-injected stock skills;
- no ambient extensions, MCP, global skills, project context files, or prompt templates in model sessions.

The upstream untracked `backend/primary-agents/reviewer/` example is not part of this integration.
Upstream role/permission protocol messages (including optional `action` and `patterns` on permission
requests) and serialized session operations are retained. Workbench
roles deny unlisted tools rather than asking users to approve forbidden internal operations.

Do not replace integration-specific files with upstream versions without retaining MySQL,
workbench authentication, per-user isolation and the restricted role/tool policy.
