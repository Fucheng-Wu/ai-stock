import type { ThinkingLevel } from "../../../shared/types.js";
import { contextUsageFromSession } from "./message-converter.js";
import type { ActiveSession, PersistedSessionRecord } from "./types.js";

export function buildPersistedRecord(active: ActiveSession, workspace: string): PersistedSessionRecord {
  const model = active.session.model;
  // Pi assigns a path immediately but creates the file only after a conversation
  // message is appended. Snapshot the full entry tree synchronously so empty
  // sessions and metadata are backed up without depending on a file's existence.
  const header = active.manager.getHeader();
  if (!header) throw new Error(`会话 ${active.id} 缺少会话头，无法生成备份`);
  const sessionJsonl = [header, ...active.manager.getEntries()]
    .map((entry) => JSON.stringify(entry)).join("\n") + "\n";
  return {
    userId: active.userId,
    summary: { ...active.summary, messageCount: active.session.messages.length },
    workspace,
    sessionPath: active.manager.getSessionFile(),
    sessionJsonl,
    rawMessages: [...active.session.messages],
    model: model ? { provider: model.provider, id: model.id } : undefined,
    thinkingLevel: active.session.thinkingLevel as ThinkingLevel,
    contextUsage: active.contextUsage || contextUsageFromSession(active.session),
  };
}
