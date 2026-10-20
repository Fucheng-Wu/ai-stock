import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { createAgentSession, SessionManager, type SessionInfo } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "../../../shared/types.js";
import { contextUsageFromSession } from "./message-converter.js";
import type { SharedResources } from "./shared-resources.js";
import type { ActiveSession, PersistedSessionRecord } from "./types.js";

type PersistableMessage = Parameters<SessionManager["appendMessage"]>[0];

export function sessionDir(resources: SharedResources): string {
  // Matches Pi's getDefaultSessionDir encoding, while respecting PI_AGENT_DIR.
  const safePath = `--${resources.cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  return join(resources.agentDir, "sessions", safePath);
}

export async function listStoredSessions(resources: SharedResources): Promise<SessionInfo[]> {
  return SessionManager.list(resources.cwd, sessionDir(resources));
}

export async function createSession(resources: SharedResources): Promise<ActiveSession> {
  // 新会话固定使用系统的 DeepSeek 默认值，不受其他 Pi 会话保存的 Provider 默认值影响。
  const modelId = process.env.AGENT_DEFAULT_MODEL?.trim() || "deepseek-v4-pro";
  const model = resources.modelRegistry.find("deepseek", modelId);
  if (!model) {
    throw new Error(`默认模型 deepseek/${modelId} 不存在，请在模型设置中配置，或调整 AGENT_DEFAULT_MODEL。`);
  }
  const manager = SessionManager.create(resources.cwd, sessionDir(resources));
  const resourceLoader = await resources.features.createResourceLoader();
  const { session } = await createAgentSession({
    cwd: resources.cwd,
    agentDir: resources.agentDir,
    sessionManager: manager,
    modelRuntime: resources.modelRuntime,
    settingsManager: resources.settingsManager,
    resourceLoader,
    model,
  });
  const now = new Date().toISOString();
  return {
    id: session.sessionId,
    session,
    manager,
    summary: { id: session.sessionId, title: "新对话", createdAt: now, updatedAt: now, messageCount: 0 },
    contextUsage: contextUsageFromSession(session),
    lastAccessAt: Date.now(),
  };
}

export async function resumeSession(resources: SharedResources, info: SessionInfo): Promise<ActiveSession> {
  const manager = SessionManager.open(info.path, sessionDir(resources), resources.cwd);
  const resourceLoader = await resources.features.createResourceLoader();
  const { session } = await createAgentSession({
    cwd: resources.cwd,
    agentDir: resources.agentDir,
    sessionManager: manager,
    modelRuntime: resources.modelRuntime,
    settingsManager: resources.settingsManager,
    resourceLoader,
  });
  return {
    id: session.sessionId,
    session,
    manager,
    summary: {
      id: session.sessionId,
      title: info.name || info.firstMessage.replace(/\s+/g, " ").trim().slice(0, 64) || "新对话",
      createdAt: info.created.toISOString(),
      updatedAt: info.modified.toISOString(),
      messageCount: info.messageCount,
    },
    contextUsage: contextUsageFromSession(session),
    lastAccessAt: Date.now(),
  };
}

function isInsideSessionDir(resources: SharedResources, path: string): boolean {
  const base = resolve(sessionDir(resources));
  const target = resolve(path);
  const rel = relative(base, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) && target.endsWith(".jsonl");
}

async function existingSessionPath(resources: SharedResources, record: PersistedSessionRecord): Promise<string | undefined> {
  if (!record.sessionPath || !isInsideSessionDir(resources, record.sessionPath)) return undefined;
  try {
    await access(record.sessionPath);
    return record.sessionPath;
  } catch {
    return undefined;
  }
}

async function restoreJsonlFile(resources: SharedResources, record: PersistedSessionRecord): Promise<string | undefined> {
  if (!record.sessionJsonl) return undefined;
  const id = record.summary.id.replace(/[^A-Za-z0-9_-]/g, "");
  if (!id) throw new Error("数据库中的会话 ID 无效");
  const dir = sessionDir(resources);
  await mkdir(dir, { recursive: true });
  const target = join(dir, `mysql-restored_${id}.jsonl`);
  // MySQL is the recovery source here, so replace a possibly stale prior restore.
  await writeFile(target, record.sessionJsonl, "utf8");
  return target;
}

/** Restore a runnable Pi session from MySQL when its local JSONL is unavailable. */
export async function resumeSessionFromDatabase(
  resources: SharedResources,
  record: PersistedSessionRecord,
): Promise<ActiveSession> {
  const storedPath = await existingSessionPath(resources, record);
  const restoredPath = storedPath || await restoreJsonlFile(resources, record);
  let manager: SessionManager;

  if (restoredPath) {
    manager = SessionManager.open(restoredPath, sessionDir(resources), resources.cwd);
  } else {
    manager = SessionManager.create(resources.cwd, sessionDir(resources), { id: record.summary.id });
    if (record.model) manager.appendModelChange(record.model.provider, record.model.id);
    if (record.thinkingLevel) manager.appendThinkingLevelChange(record.thinkingLevel);
    for (const rawMessage of record.rawMessages) {
      try { manager.appendMessage(rawMessage as PersistableMessage); }
      catch (error) { console.warn(`Skipped unsupported restored message in ${record.summary.id}`, error); }
    }
    if (record.summary.title && record.summary.title !== "新对话") {
      manager.appendSessionInfo(record.summary.title);
    }
  }

  const resourceLoader = await resources.features.createResourceLoader();
  const { session } = await createAgentSession({
    cwd: resources.cwd,
    agentDir: resources.agentDir,
    sessionManager: manager,
    modelRuntime: resources.modelRuntime,
    settingsManager: resources.settingsManager,
    resourceLoader,
  });
  return {
    id: session.sessionId,
    session,
    manager,
    summary: { ...record.summary },
    contextUsage: record.contextUsage || contextUsageFromSession(session),
    lastAccessAt: Date.now(),
  };
}

/** Convert an existing Pi JSONL session into a MySQL persistence record. */
export async function recordFromStoredSession(
  resources: SharedResources,
  info: SessionInfo,
): Promise<PersistedSessionRecord> {
  const manager = SessionManager.open(info.path, sessionDir(resources), resources.cwd);
  const projection = manager.buildSessionProjection();
  const sessionJsonl = await readFile(info.path, "utf8");
  return {
    summary: {
      id: info.id,
      title: info.name || info.firstMessage.replace(/\s+/g, " ").trim().slice(0, 64) || "新对话",
      createdAt: info.created.toISOString(),
      updatedAt: info.modified.toISOString(),
      messageCount: info.messageCount,
    },
    workspace: resources.cwd,
    sessionPath: info.path,
    sessionJsonl,
    rawMessages: projection.messages,
    model: projection.model ? { provider: projection.model.provider, id: projection.model.modelId } : undefined,
    thinkingLevel: projection.thinkingLevel as ThinkingLevel,
  };
}

