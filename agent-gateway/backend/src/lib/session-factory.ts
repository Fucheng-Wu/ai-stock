import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute, join, relative, resolve } from "node:path";
import { createAgentSession, SessionManager, type SessionInfo } from "@earendil-works/pi-coding-agent";
import type { ThinkingLevel } from "../../../shared/types.js";
import { contextUsageFromSession } from "./message-converter.js";
import type { SharedResources } from "./shared-resources.js";
import type { ActiveSession, PersistedSessionRecord } from "./types.js";
import type { RoleRuntime } from "./permissions.js";
import { GENERAL_PRIMARY_ID, PRIMARY_TOOLS } from "./agent-policy.js";

type PersistableMessage = Parameters<SessionManager["appendMessage"]>[0];

async function buildSession(resources: SharedResources, manager: SessionManager, useDefaultModel = false) {
  // Always migrate legacy sessions to the restricted role, including MySQL JSONL recovery.
  const role: RoleRuntime = {
    sessionId: manager.getSessionId(),
    profile: await resources.primaryAgents.get(GENERAL_PRIMARY_ID),
    controller: new AbortController(),
  };
  const modelId = process.env.AGENT_DEFAULT_MODEL?.trim() || "deepseek-v4-pro";
  const projection = manager.buildSessionProjection();
  // Pi only restores selections automatically when a session has messages.
  // Empty persisted conversations still need to retain their selected settings.
  const emptySessionSettings = !useDefaultModel && projection.messages.length === 0 ? projection : undefined;
  const model = useDefaultModel
    ? resources.modelRegistry.find("deepseek", modelId)
    : emptySessionSettings?.model
      ? resources.modelRegistry.find(emptySessionSettings.model.provider, emptySessionSettings.model.modelId)
      : undefined;
  if (useDefaultModel && !model) throw new Error(`默认模型 deepseek/${modelId} 不存在，请在模型设置中配置，或调整 AGENT_DEFAULT_MODEL。`);
  const resourceLoader = await resources.features.createResourceLoader(role);
  const { session } = await createAgentSession({
    cwd: resources.cwd, agentDir: resources.agentDir, sessionManager: manager,
    modelRuntime: resources.modelRuntime, settingsManager: resources.settingsManager,
    resourceLoader, tools: [...PRIMARY_TOOLS], ...(model ? { model } : {}),
    ...(emptySessionSettings ? { thinkingLevel: emptySessionSettings.thinkingLevel as ThinkingLevel } : {}),
  });
  try {
    await session.bindExtensions({});
    manager.appendCustomEntry("primary-agent", { profileId: GENERAL_PRIMARY_ID });
  } catch (error) {
    session.dispose();
    throw error;
  }
  return {
    session, role,
    onDispose: () => resources.permissions.cancelSession(session.sessionId, "会话已关闭", true),
  };
}

export function runSessionOperation<T>(active: ActiveSession, operation: () => Promise<T>): Promise<T> {
  if (active.operationTask || active.promptTask || !active.session.isIdle) throw new Error("会话正在工作，请等待完成或先取消");
  const task = operation();
  active.operationTask = task;
  return task.finally(() => { if (active.operationTask === task) active.operationTask = undefined; });
}

export async function switchPrimaryAgent(resources: SharedResources, _active: ActiveSession, agentId: string): Promise<void> {
  // Protocol-compatible with upstream, but no role can lift this workbench's restrictions.
  await resources.primaryAgents.get(agentId);
}

export function sessionDir(resources: SharedResources, userId: string): string {
  // Matches Pi's getDefaultSessionDir encoding, while respecting PI_AGENT_DIR.
  const safePath = `--${resources.cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  const userKey = createHash("sha256").update(userId).digest("hex");
  return join(resources.agentDir, "sessions", safePath, `user-${userKey}`);
}

export async function listStoredSessions(resources: SharedResources, userId: string): Promise<SessionInfo[]> {
  return SessionManager.list(resources.cwd, sessionDir(resources, userId));
}

export async function createSession(resources: SharedResources, userId: string): Promise<ActiveSession> {
  const manager = SessionManager.create(resources.cwd, sessionDir(resources, userId));
  const built = await buildSession(resources, manager, true);
  const { session } = built;
  const now = new Date().toISOString();
  return {
    id: session.sessionId,
    userId,
    ...built,
    manager,
    summary: { id: session.sessionId, title: "新对话", createdAt: now, updatedAt: now, messageCount: 0 },
    contextUsage: contextUsageFromSession(session),
    lastAccessAt: Date.now(),
  };
}

export async function resumeSession(resources: SharedResources, info: SessionInfo, userId: string): Promise<ActiveSession> {
  const manager = SessionManager.open(info.path, sessionDir(resources, userId), resources.cwd);
  const built = await buildSession(resources, manager);
  const { session } = built;
  return {
    id: session.sessionId,
    userId,
    ...built,
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

function isInsideSessionDir(resources: SharedResources, userId: string, path: string): boolean {
  const base = resolve(sessionDir(resources, userId));
  const target = resolve(path);
  const rel = relative(base, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) && target.endsWith(".jsonl");
}

async function existingSessionPath(resources: SharedResources, record: PersistedSessionRecord): Promise<string | undefined> {
  if (!record.sessionPath || !isInsideSessionDir(resources, record.userId, record.sessionPath)) return undefined;
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
  const dir = sessionDir(resources, record.userId);
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
    manager = SessionManager.open(restoredPath, sessionDir(resources, record.userId), resources.cwd);
  } else {
    manager = SessionManager.create(resources.cwd, sessionDir(resources, record.userId), { id: record.summary.id });
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

  // A title renamed while the SDK session was unloaded is authoritative in MySQL.
  if (manager.getSessionName() !== record.summary.title) manager.appendSessionInfo(record.summary.title);
  const built = await buildSession(resources, manager);
  const { session } = built;
  return {
    id: session.sessionId,
    userId: record.userId,
    ...built,
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
  userId: string,
): Promise<PersistedSessionRecord> {
  const manager = SessionManager.open(info.path, sessionDir(resources, userId), resources.cwd);
  const projection = manager.buildSessionProjection();
  const sessionJsonl = await readFile(info.path, "utf8");
  return {
    userId,
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

