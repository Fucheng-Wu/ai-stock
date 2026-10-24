# Upstream baseline

The embedded backend is synchronized with:

- Source: `C:\Users\orange\Desktop\study\pi\pi-agent-gateway`
- Branch: `main`
- Commit: `94d9d752f2ada9145454e967c1721cfe68bf685e`
- Commit subject: `fix: show live thinking and streamline permission approvals`
- Commit date: `2026-10-25 01:11:13 +0800`

This update incorporates upstream's scoped session approvals, matching pending-request resolution,
batch rejection, multiline wildcard matching, and separate operation/directory permission checks.
The Vue 2 chat adapts upstream's live thinking panel (auto-open, follow latest, manual collapse,
and collapse when answer text starts) and permission dialog with explicit approval scopes.
The workbench's exact tool allowlists are checked before these approval rules; upstream Build's
broader default permissions and ambient custom roles are intentionally not enabled.

The following integration-specific changes are intentionally maintained on top of upstream:

- MySQL session persistence in `backend/src/lib/database.ts`;
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

Do not replace the integration-specific files with their upstream versions without reapplying the
MySQL persistence layer.
