# Upstream synchronization

The embedded backend is synchronized with:

- Source: `C:\Users\orange\Desktop\study\pi\pi-agent-gateway`
- Branch: `main`
- Original baseline: `94d9d752f2ada9145454e967c1721cfe68bf685e`
- Latest selectively adapted commit: `f3afb9caa2b5d7cbdcdc642cc461dd23edef1fbe`
- Commit subject: `feat: add image questions and simplify chat composer`
- Commit date: `2026-10-25 22:41:24 +0800`

## Changes adapted from f3afb9c

- Image questions through the existing authenticated WebSocket protocol: optional raw-base64
  attachments, PNG/JPEG/GIF/WebP, up to four images at 5 MiB each, and image-only prompts.
  Runtime validation rejects unsupported MIME types, malformed base64 and oversized input.
  The incoming message limit is 32 MiB and the outgoing backpressure threshold is 64 MiB.
- Model discovery exposes `supportsImages`; both the Vue composer and backend reject image
  prompts for text-only models. The composer offers configured models and thinking levels,
  while the primary role remains fixed to the restricted ordinary Agent.
- Vue 2 upload, paste and drop handling, attachment thumbnails, removal, full-size previews,
  image history, rejection/retry recovery and account/session-scoped in-memory image drafts.
  Text drafts continue using sessionStorage; unsent images do not survive page refresh.
  Images and text being entered during initial session creation are retained.
- A taller composer with its send/stop control inside the lower right corner and the
  attachment/model/thinking/context toolbar underneath, adapted for mobile and both themes.
- Workbench adaptation: the stock child receives the current user turn's images directly from
  its owning session branch. Raw image bytes are not model-generated Agent arguments, and
  images from an earlier user turn are not forwarded automatically to an unrelated child task.
  Child images are visible in its panel and survive existing MySQL/JSONL record recovery.
- The upstream coding roles, workspace/file operations and standalone frontend are excluded.
  Existing stock identity forwarding, user isolation and exact tool allowlists remain enforced.

Upstream committed these changes while synchronization was in progress; the final source revision
is the commit above. `backend/subagents` has no additional stock role to copy in this revision.
No dependency or database schema changes are required.

Validation: backend typecheck and 20 tests, including real SDK image payloads for both primary
and child, record recovery, rejected image payloads and tool-policy regressions; 42 frontend state
and image-reading tests; production build; desktop/mobile browser checks for uploads, previews,
image-only send, optimistic reconciliation, model capability checks, paste/drop and layout.
The SDK test uses a local model stub; no paid external vision model was invoked.

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
- one restricted primary role (`general`) and separate stock (`stock-analyst`) and public research (`web-researcher`) subagents,
  replacing upstream's coding-oriented Build/Plan and general-purpose child roles;
- exact tool allowlists in `agent-policy.ts` and execution guards in `permissions.ts`;
- role-isolated stock business tools and Tavily public search, with server-injected skills for each child;
- no ambient extensions, MCP, global skills, project context files, or prompt templates in model sessions.

The upstream untracked `backend/primary-agents/reviewer/` example is not part of this integration.
Upstream role/permission protocol messages (including optional `action` and `patterns` on permission
requests) and serialized session operations are retained. Workbench
roles deny unlisted tools rather than asking users to approve forbidden internal operations.

Do not replace integration-specific files with upstream versions without retaining MySQL,
workbench authentication, per-user isolation and the restricted role/tool policy.
