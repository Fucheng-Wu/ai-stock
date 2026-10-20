# Upstream baseline

The embedded backend is synchronized with:

- Source: `C:\Users\orange\Desktop\study\pi\pi-agent-gateway`
- Branch: `main`
- Commit: `124d7a68b3a587361cf4d415bf1e8cd6af600682`
- Commit subject: `fix: merge assistant tool turns`
- Commit date: `2026-10-19 00:26:27 +0800`

The following integration-specific changes are intentionally maintained on top of upstream:

- MySQL session persistence in `backend/src/lib/database.ts`;
- persistence and recovery hooks in `index.ts`, `session-factory.ts`, `event-relay.ts`, and `types.ts`;
- project-local `.env` configuration and start scripts;
- the RuoYi Vue 2 interface replaces upstream's standalone Vite frontend.

Do not replace the integration-specific files with their upstream versions without reapplying the
MySQL persistence layer.
