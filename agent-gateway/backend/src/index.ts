import { unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocket, WebSocketServer } from "ws";
import { PROTOCOL_VERSION, type AgentUiEvent, type ClientMessage, type ImageAttachment, type ServerMessage, type SessionSnapshot, type ThinkingLevel } from "../../shared/types.js";
import { MAX_MESSAGE_BYTES } from "../../shared/images.js";
import { validateClientMessage } from "../../shared/validation.js";
import { WsAuthInteraction } from "./lib/auth-bridge.js";
import { loadGatewayEnvironment, MySqlSessionStore } from "./lib/database.js";
import { attachEventRelay } from "./lib/event-relay.js";
import { contextUsageFromSession, convertActiveMessages, convertMessages } from "./lib/message-converter.js";
import { ModelManager } from "./lib/model-manager.js";
import {
  createSession,
  resumeSessionFromDatabase,
  sessionDir,
  runSessionOperation,
  switchPrimaryAgent,
} from "./lib/session-factory.js";
import { SessionPool } from "./lib/session-pool.js";
import { buildPersistedRecord } from "./lib/session-record.js";
import { createSharedResources } from "./lib/shared-resources.js";
import { runWithWorkbenchToolToken } from "./lib/workbench-api.js";
import type { ActiveSession } from "./lib/types.js";
import { authenticateWorkbench, requireCommandPermission, WorkbenchAuthError, WorkbenchServiceError, type WorkbenchIdentity } from "./lib/workbench-auth.js";
import { historyPage } from "./lib/history-page.js";
import { sendEncoded } from "./lib/transport.js";

loadGatewayEnvironment();
const workspace = resolve(process.env.PI_WORKSPACE_DIR || process.cwd());
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be between 1 and 65535");

const resources = await createSharedResources(workspace);
const sessionStore = new MySqlSessionStore();
await sessionStore.initialize();
const models = new ModelManager(resources);
const pool = new SessionPool(5);
const clients = new Set<WebSocket>();
const initializedClients = new WeakSet<WebSocket>();
const initializingClients = new WeakSet<WebSocket>();
const identities = new WeakMap<WebSocket, WorkbenchIdentity>();
const pendingLoads = new Map<string, Promise<ActiveSession>>();
const pendingPersistence = new Map<string, Promise<void>>();
const deletedSessionIds = new Set<string>();
const clientIds = new WeakMap<WebSocket, string>();
const authInteractions = new Set<WsAuthInteraction>();
const activeRequests = new Set<Promise<void>>();
const serverEpoch = randomUUID();
let shuttingDown = false;
resources.permissions.setNotifier((owner, message) => {
  for (const ws of clients) if (clientIds.get(ws) === owner && initializedClients.has(ws)) send(ws, message);
});

function send(ws: WebSocket, message: ServerMessage): void {
  sendEncoded(ws, JSON.stringify(message));
}

function broadcast(message: ServerMessage, userId?: string): void {
  const encoded = JSON.stringify(message);
  for (const ws of clients) {
    const identity = identities.get(ws);
    if (initializedClients.has(ws) && identity && identity.authorizedUntil > Date.now()
        && (userId === undefined || identity.userId === userId)) sendEncoded(ws, encoded);
  }
}

function broadcastEvent(event: AgentUiEvent): void {
  const active = pool.get(event.sessionId);
  if (active) {
    active.sequence = (active.sequence || 0) + 1;
    broadcast({ ...event, epoch: active.epoch, sequence: active.sequence }, active.userId);
  }
}

function notifyCatalogChanged(): void {
  broadcast({ type: "models", models: models.getModelsInfo() });
  broadcast({ type: "providers", providers: models.getProvidersInfo() });
}

async function reloadIdleSessions(): Promise<void> {
  const results = await Promise.allSettled(
    pool.values()
      .filter((active) => active.session.isIdle && !active.promptTask && !active.operationTask)
      .map((active) => runSessionOperation(active, () => active.session.reload())),
  );
  for (const result of results) {
    if (result.status === "rejected") console.error("Failed to reload session resources", result.reason);
  }
}

async function sendFeatureSettings(
  ws: WebSocket,
  type: "feature_settings" | "feature_action_complete",
  requestId?: string,
  category?: "skills" | "plugins" | "subagents" | "mcp",
): Promise<void> {
  const settings = await resources.features.getSettings();
  if (type === "feature_settings") send(ws, { type, settings, requestId });
  else if (category) send(ws, { type, category, settings, requestId });
}

function persistSession(active: ActiveSession): Promise<void> {
  const previous = pendingPersistence.get(active.id) || Promise.resolve();
  const task = previous.catch(() => undefined).then(async () => {
    if (deletedSessionIds.has(active.id)) return;
    await sessionStore.save(buildPersistedRecord(active, workspace));
  });
  pendingPersistence.set(active.id, task);
  const cleanup = () => {
    if (pendingPersistence.get(active.id) === task) pendingPersistence.delete(active.id);
  };
  task.then(cleanup, cleanup);
  return task;
}

function schedulePersistence(active: ActiveSession): void {
  if (shuttingDown) return;
  void persistSession(active).catch((error) => {
    console.error(`Failed to persist Agent session ${active.id} to MySQL`, error);
  });
}

function attach(active: ActiveSession): ActiveSession {
  if (shuttingDown) {
    active.role.controller.abort();
    active.onDispose?.();
    active.session.dispose();
    throw new Error("服务正在关闭，请稍后重新连接");
  }
  active.epoch = randomUUID();
  active.sequence = 0;
  pool.add(active);
  attachEventRelay(
    active,
    broadcastEvent,
    () => broadcast({ type: "session_state", session: snapshot(active) }, active.userId),
    () => schedulePersistence(active),
  );
  return active;
}

async function getSession(userId: string, sessionId: string): Promise<ActiveSession> {
  const loaded = pool.get(sessionId);
  if (loaded) {
    if (loaded.userId !== userId) throw new Error("会话不存在或无权访问");
    return loaded;
  }
  const pending = pendingLoads.get(sessionId);
  if (pending) {
    const active = await pending;
    if (active.userId !== userId) throw new Error("会话不存在或无权访问");
    return active;
  }
  const task = (async () => {
    const record = await sessionStore.get(workspace, userId, sessionId);
    // No fallback to the shared legacy JSONL directory: it has no trustworthy owner.
    if (!record) throw new Error("会话不存在或无权访问");
    const active = await resumeSessionFromDatabase(resources, record);
    attach(active);
    schedulePersistence(active);
    return active;
  })();
  pendingLoads.set(sessionId, task);
  try { return await task; }
  finally { pendingLoads.delete(sessionId); }
}

function snapshot(active: ActiveSession, before?: string): SessionSnapshot {
  const model = active.session.model;
  return {
    summary: active.summary,
    ...historyPage(convertActiveMessages(active), before),
    model: model ? { provider: model.provider, id: model.id } : undefined,
    thinkingLevel: active.session.thinkingLevel as ThinkingLevel,
    isStreaming: active.session.isStreaming || !!active.promptTask,
    contextUsage: contextUsageFromSession(active.session),
    primaryAgentId: active.role.profile.id,
    phase: active.phase,
    startedAt: active.startedAt,
    epoch: active.epoch,
    sequence: active.sequence,
  };
}

async function loadHistory(userId: string, sessionId: string, before?: string): Promise<SessionSnapshot> {
  const active = pool.get(sessionId);
  if (active) {
    if (active.userId !== userId) throw new Error("会话不存在或无权访问");
    return snapshot(active, before);
  }
  // Reading history must not consume one of the live SDK session slots.
  const record = await sessionStore.get(workspace, userId, sessionId, false);
  if (!record) throw new Error("会话不存在或无权访问");
  return {
    summary: record.summary, ...historyPage(convertMessages(record.rawMessages), before),
    model: record.model, thinkingLevel: record.thinkingLevel,
    contextUsage: record.contextUsage, isStreaming: false, primaryAgentId: "general",
    epoch: `stored:${serverEpoch}:${sessionId}`, sequence: 0,
  };
}

function requireText(value: unknown, field: string, maxLength = 500_000): string {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new Error(`${field} 必须是非空字符串，且不超过 ${maxLength} 字符`);
  }
  return value;
}

function requireString(value: unknown, field: string, maxLength = 100_000): string {
  if (typeof value !== "string" || value.length > maxLength) {
    throw new Error(`${field} 必须是字符串，且不超过 ${maxLength} 字符`);
  }
  return value;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} 必须是对象`);
  return value as Record<string, unknown>;
}

function parseClientMessage(data: WebSocket.RawData): ClientMessage {
  let parsed: unknown;
  try { parsed = JSON.parse(data.toString()); }
  catch { throw new Error("消息不是有效 JSON"); }
  return validateClientMessage(parsed);
}

function lastPromptError(active: ActiveSession): string | undefined {
  const last = [...active.session.messages].reverse().find((item) => item.role === "assistant");
  return last?.role === "assistant" && last.stopReason === "error"
    ? last.errorMessage || "模型调用失败"
    : undefined;
}

function startPrompt(ws: WebSocket, active: ActiveSession, text: string, requestId?: string, workbenchAccessToken?: string, images?: ImageAttachment[]): void {
  if (active.promptTask || active.operationTask || !active.session.isIdle) throw new Error("此会话正在工作，请等待或先取消");
  if (images?.length && !active.session.model?.input.includes("image")) throw new Error("当前模型未启用图像输入，暂时无法发送图片。");
  active.role.controller = new AbortController();
  active.startedAt = new Date().toISOString();
  active.phase = "waiting";
  resources.permissions.setOwner(active.id, clientIds.get(ws)!);
  let accepted = false;
  let promptError: string | undefined;
  const task = (async () => {
    await persistSession(active);
    if (active.role.controller.signal.aborted) throw new Error("已取消发送");
    accepted = true;
    send(ws, { type: "prompt_accepted", sessionId: active.id, requestId });
    await runWithWorkbenchToolToken(workbenchAccessToken, () => active.session.prompt(text, { expandPromptTemplates: false, images: images?.map(({ data, mimeType }) => ({ type: "image" as const, data, mimeType })) }));
    promptError = lastPromptError(active);
  })()
    .catch((error) => {
      promptError = error instanceof Error ? error.message : String(error);
      send(ws, { type: "error", code: accepted ? "GENERATION_FAILED" : "REQUEST_FAILED", message: promptError, sessionId: active.id, requestId });
    })
    .finally(() => {
      resources.permissions.cancelSession(active.id, "本轮任务已结束");
      active.promptTask = undefined;
      active.phase = undefined;
      active.summary.updatedAt = new Date().toISOString();
      active.summary.messageCount = active.session.messages.length;
      active.contextUsage = contextUsageFromSession(active.session);
      broadcastEvent({ type: "agent_end", sessionId: active.id, contextUsage: active.contextUsage, error: promptError });
      schedulePersistence(active);
    });
  active.promptTask = task;
}

function validDeletePath(userId: string, path: string): boolean {
  const base = resolve(sessionDir(resources, userId));
  const target = resolve(path);
  const rel = relative(base, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) && target.endsWith(".jsonl");
}

async function deleteSession(userId: string, sessionId: string): Promise<void> {
  await pendingLoads.get(sessionId);
  const record = await sessionStore.get(workspace, userId, sessionId);
  const active = pool.get(sessionId);
  if (active && active.userId !== userId) throw new Error("会话不存在或无权访问");
  if (!active && !record) throw new Error("会话不存在或无权访问");
  await active?.operationTask;
  active?.role.controller.abort();
  resources.permissions.cancelSession(sessionId);
  if (active?.session.isStreaming) await active.session.abort();
  await active?.promptTask;
  const pending = pendingPersistence.get(sessionId);
  if (pending) await pending.catch(() => undefined);
  deletedSessionIds.add(sessionId);
  pool.remove(sessionId);
  await sessionStore.delete(workspace, userId, sessionId);
  const candidatePaths = new Set([active?.manager.getSessionFile(), record?.sessionPath].filter(Boolean) as string[]);
  for (const path of candidatePaths) {
    if (!validDeletePath(userId, path)) continue;
    try { await unlink(path); }
    catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code !== "ENOENT") throw error;
    }
  }
  broadcast({ type: "session_deleted", sessionId }, userId);
}

async function route(ws: WebSocket, auth: WsAuthInteraction, message: ClientMessage): Promise<void> {
  const requestId = message.requestId;
  let identity: WorkbenchIdentity;
  if (message.type === "init") {
    if (initializingClients.has(ws) || identities.has(ws)) throw new Error("连接已初始化或正在初始化，请重新连接后再试");
    initializingClients.add(ws);
    try {
      identity = await authenticateWorkbench(message.accessToken);
      if (ws.readyState !== WebSocket.OPEN) return;
      identities.set(ws, identity);
    } finally {
      initializingClients.delete(ws);
    }
  } else {
    const previous = identities.get(ws);
    if (!previous) throw new WorkbenchAuthError("请先完成登录握手");
    // Includes heartbeat: logout and permission revocation also invalidate idle connections.
    identity = await authenticateWorkbench(previous.token);
    if (identity.userId !== previous.userId) throw new WorkbenchAuthError("登录身份已变化，请重新连接");
    if (ws.readyState !== WebSocket.OPEN || identities.get(ws) !== previous) return;
    previous.authorizedUntil = identity.authorizedUntil;
    previous.canManage = identity.canManage;
    identity = previous;
  }
  const userId = identity.userId;
  requireCommandPermission(identity, message.type);
  switch (message.type) {
    case "init": {
      if (message.protocolVersion !== PROTOCOL_VERSION) {
        throw new Error(`协议版本不兼容：客户端 ${message.protocolVersion}，服务端 ${PROTOCOL_VERSION}`);
      }
      const [page, settings, primaryAgents] = await Promise.all([
        sessionStore.list(workspace, userId),
        identity.canManage ? resources.features.getSettings() : Promise.resolve({
          skills: [], plugins: [], subagents: { enabled: true, maxConcurrent: 1, active: 0, profiles: [] },
          mcp: { path: "", content: "", serverCount: 0, enabledServerCount: 0 },
        }),
        resources.primaryAgents.list(),
      ]);
      send(ws, {
        type: "init",
        protocolVersion: PROTOCOL_VERSION,
        ...page,
        userId,
        canManage: identity.canManage,
        models: models.getModelsInfo(),
        providers: models.getProvidersInfo(),
        settings,
        primaryAgents,
        requestId,
      });
      initializedClients.add(ws);
      for (const permission of resources.permissions.list(clientIds.get(ws)!)) send(ws, { type: "permission_request", permission });
      return;
    }
    case "ping": send(ws, { type: "pong", requestId }); return;
    case "list_sessions": {
      const query = message.query === undefined ? "" : requireString(message.query, "query", 100).trim();
      const cursor = message.cursor === undefined ? undefined : requireText(message.cursor, "cursor", 512);
      send(ws, { type: "sessions", ...await sessionStore.list(workspace, userId, query, cursor), requestId });
      return;
    }
    case "create_session": {
      const active = attach(await createSession(resources, userId));
      await persistSession(active);
      send(ws, { type: "session_created", session: snapshot(active), requestId });
      broadcastEvent({ type: "session_updated", sessionId: active.id, summary: active.summary });
      return;
    }
    case "list_primary_agents":
      send(ws, { type: "primary_agents", agents: await resources.primaryAgents.list(), requestId });
      return;
    case "set_primary_agent": {
      const active = await getSession(userId, requireText(message.sessionId, "sessionId", 128));
      await runSessionOperation(active, async () => {
        await switchPrimaryAgent(resources, active, requireText(message.agentId, "agentId", 64));
        await persistSession(active);
        broadcastEvent({ type: "session_updated", sessionId: active.id, primaryAgentId: active.role.profile.id });
        send(ws, { type: "session_state", session: snapshot(active), requestId });
      });
      return;
    }
    case "permission_response": {
      if (!["allow_once", "allow_session", "deny"].includes(message.decision)) throw new Error("权限决定无效");
      resources.permissions.respond(clientIds.get(ws)!, requireText(message.permissionId, "permissionId", 128), message.decision);
      return;
    }
    case "load_session": {
      const sessionId = requireText(message.sessionId, "sessionId", 128);
      const before = message.before === undefined ? undefined : requireText(message.before, "before", 128);
      const state = await loadHistory(userId, sessionId, before);
      if (before) send(ws, { type: "history_page", sessionId, messages: state.messages, nextBefore: state.nextBefore, requestId });
      else send(ws, { type: "session_state", session: state, requestId });
      return;
    }
    case "rename_session": {
      const sessionId = requireText(message.sessionId, "sessionId", 128);
      const title = requireText(message.title, "title", 64).trim();
      const active = pool.get(sessionId);
      if (active && active.userId !== userId) throw new Error("会话不存在或无权访问");
      if (active) {
        active.summary.title = title;
        active.manager.appendSessionInfo(title);
        await persistSession(active);
      } else {
        await sessionStore.rename(workspace, userId, sessionId, title);
      }
      broadcast({ type: "session_renamed", sessionId, title, requestId }, userId);
      return;
    }
    case "delete_session":
      await deleteSession(userId, requireText(message.sessionId, "sessionId", 128));
      return;
    case "prompt": {
      const active = await getSession(userId, requireText(message.sessionId, "sessionId", 128));
      startPrompt(ws, active, message.text, requestId, identity.token, message.images);
      return;
    }
    case "abort": {
      const active = await getSession(userId, requireText(message.sessionId, "sessionId", 128));
      active.role.controller.abort();
      resources.permissions.cancelSession(active.id);
      await active.session.abort();
      await active.promptTask;
      await persistSession(active);
      send(ws, { type: "request_complete", sessionId: active.id, requestId });
      return;
    }
    case "set_model": {
      const active = await getSession(userId, requireText(message.sessionId, "sessionId", 128));
      const provider = requireText(message.provider, "provider", 128);
      const modelId = requireText(message.modelId, "modelId", 256);
      const model = resources.modelRegistry.find(provider, modelId);
      if (!model) throw new Error("模型不存在");
      if (!resources.modelRegistry.hasConfiguredAuth(model)) throw new Error("请先配置此模型的 Provider 认证");
      await runSessionOperation(active, async () => {
        await active.session.setModel(model);
        await persistSession(active);
      });
      broadcastEvent({
        type: "session_updated", sessionId: active.id, model: { provider, id: modelId }, thinkingLevel: active.session.thinkingLevel as ThinkingLevel,
      });
      return;
    }
    case "set_thinking_level": {
      const active = await getSession(userId, requireText(message.sessionId, "sessionId", 128));
      const allowed: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
      if (!allowed.includes(message.level)) throw new Error("思考强度无效");
      await runSessionOperation(active, async () => {
        active.session.setThinkingLevel(message.level);
        await persistSession(active);
      });
      broadcastEvent({
        type: "session_updated", sessionId: active.id, thinkingLevel: active.session.thinkingLevel as ThinkingLevel,
      });
      return;
    }
    case "list_models": send(ws, { type: "models", models: models.getModelsInfo(), requestId }); return;
    case "get_models_config": send(ws, { type: "models_config", content: await models.readConfig(), requestId }); return;
    case "save_models_config": {
      await models.saveConfig(requireText(message.content, "content", 2_000_000));
      send(ws, { type: "models_saved", requestId });
      notifyCatalogChanged();
      return;
    }
    case "discover_provider_models": {
      const providerName = requireText(message.providerName, "providerName", 128);
      const discovered = await models.discoverProviderModels(providerName, requireRecord(message.provider, "provider"));
      send(ws, { type: "provider_models_discovered", providerName, ...discovered, requestId });
      return;
    }
    case "test_model_config": {
      const providerName = requireText(message.providerName, "providerName", 128);
      const model = requireRecord(message.model, "model");
      const modelId = requireText(model.id, "model.id", 256);
      const result = await models.testModelConfig(providerName, requireRecord(message.provider, "provider"), model);
      send(ws, { type: "model_config_tested", providerName, modelId, result, requestId });
      return;
    }
    case "list_providers": send(ws, { type: "providers", providers: models.getProvidersInfo(), requestId }); return;
    case "provider_login":
      void auth.login(requireText(message.providerId, "providerId", 128), message.methodId)
        .catch((error) => send(ws, { type: "error", message: error instanceof Error ? error.message : String(error), requestId }));
      return;
    case "auth_response":
      auth.respond(requireText(message.challengeId, "challengeId", 128), requireString(message.value, "value"));
      return;
    case "auth_cancel": auth.cancel(requireText(message.challengeId, "challengeId", 128)); return;
    case "get_feature_settings":
      await sendFeatureSettings(ws, "feature_settings", requestId);
      return;
    case "create_skill":
      if (message.scope !== "global" && message.scope !== "project") throw new Error("技能作用域无效");
      await resources.features.createSkill({
        name: requireText(message.name, "name", 64),
        description: requireText(message.description, "description", 500),
        instructions: requireText(message.instructions, "instructions", 100_000),
        scope: message.scope,
      });
      await reloadIdleSessions();
      await sendFeatureSettings(ws, "feature_action_complete", requestId, "skills");
      return;
    case "set_skill_enabled":
      if (typeof message.enabled !== "boolean") throw new Error("enabled 必须是布尔值");
      await resources.features.setSkillEnabled(requireText(message.filePath, "filePath", 4_096), message.enabled);
      await reloadIdleSessions();
      await sendFeatureSettings(ws, "feature_action_complete", requestId, "skills");
      return;
    case "plugin_action":
      if (!["install", "remove", "update"].includes(message.action)) throw new Error("插件操作无效");
      if (message.scope !== undefined && message.scope !== "global" && message.scope !== "project") throw new Error("插件作用域无效");
      await resources.features.runPluginAction(message.action, requireText(message.source, "source", 500), message.scope);
      await reloadIdleSessions();
      await sendFeatureSettings(ws, "feature_action_complete", requestId, "plugins");
      return;
    case "set_plugin_enabled":
      if (typeof message.enabled !== "boolean") throw new Error("enabled 必须是布尔值");
      if (message.scope !== "global" && message.scope !== "project") throw new Error("插件作用域无效");
      await resources.features.setPluginEnabled(requireText(message.source, "source", 500), message.scope, message.enabled);
      await reloadIdleSessions();
      await sendFeatureSettings(ws, "feature_action_complete", requestId, "plugins");
      return;
    case "set_subagent_settings":
      if (message.enabled !== undefined && typeof message.enabled !== "boolean") throw new Error("enabled 必须是布尔值");
      await resources.features.setSubagentSettings({ enabled: message.enabled, maxConcurrent: message.maxConcurrent });
      await reloadIdleSessions();
      await sendFeatureSettings(ws, "feature_action_complete", requestId, "subagents");
      return;
    case "set_subagent_profile_enabled":
      if (typeof message.enabled !== "boolean") throw new Error("enabled 必须是布尔值");
      await resources.features.setSubagentProfileEnabled(message.profileId, message.enabled);
      await reloadIdleSessions();
      await sendFeatureSettings(ws, "feature_action_complete", requestId, "subagents");
      return;
    case "create_subagent_profile":
      if (message.scope !== "global" && message.scope !== "project") throw new Error("子代理作用域无效");
      if (!Array.isArray(message.tools) || !message.tools.every((tool) => typeof tool === "string")) throw new Error("tools 必须是字符串数组");
      if (message.skills !== undefined && (!Array.isArray(message.skills) || !message.skills.every((skill) => typeof skill === "string"))) throw new Error("skills 必须是字符串数组");
      if (message.extensions !== undefined && (!Array.isArray(message.extensions) || !message.extensions.every((extension) => typeof extension === "string"))) throw new Error("extensions 必须是字符串数组");
      await resources.features.createSubagentProfile({
        id: requireText(message.id, "id", 64),
        name: requireText(message.name, "name", 100),
        description: requireText(message.description, "description", 500),
        systemPrompt: requireText(message.systemPrompt, "systemPrompt", 50_000),
        tools: message.tools,
        skills: message.skills,
        extensions: message.extensions,
        scope: message.scope,
      });
      await reloadIdleSessions();
      await sendFeatureSettings(ws, "feature_action_complete", requestId, "subagents");
      return;
    case "delete_subagent_profile":
      await resources.features.deleteSubagentProfile(requireText(message.profileId, "profileId", 64));
      await reloadIdleSessions();
      await sendFeatureSettings(ws, "feature_action_complete", requestId, "subagents");
      return;
    case "save_mcp_config":
      await resources.features.saveMcpConfig(requireText(message.content, "content", 2_000_000));
      await reloadIdleSessions();
      await sendFeatureSettings(ws, "feature_action_complete", requestId, "mcp");
      return;
    default: throw new Error("不支持的消息类型");
  }
}

const app = new Hono();
app.get("/api/health", (context) => context.json({ ok: true, service: "pi-agent-gateway", sessionStorage: "mysql" }));
app.get("/", (context) => context.text("Pi Agent Gateway is running"));

const server = serve({ fetch: app.fetch, hostname: host, port });
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

function acceptedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // CLI clients have no browser Origin.
  try {
    const url = new URL(origin);
    const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    const localPort = [String(port), "5173"].includes(url.port);
    return ["http:", "https:"].includes(url.protocol) && localHost && localPort;
  } catch { return false; }
}

server.on("upgrade", (request, socket, head) => {
  let pathname: string;
  try { pathname = new URL(request.url || "/", `http://${request.headers.host || host}`).pathname; }
  catch { socket.destroy(); return; }
  if (shuttingDown || pathname !== "/ws" || !acceptedOrigin(request.headers.origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
});

wss.on("connection", (ws) => {
  clients.add(ws);
  clientIds.set(ws, randomUUID());
  const auth = new WsAuthInteraction(resources, (message) => send(ws, message), notifyCatalogChanged);
  authInteractions.add(auth);
  ws.on("message", (data) => {
    let message: ClientMessage;
    try { message = parseClientMessage(data); }
    catch (error) {
      let requestId: string | undefined;
      try {
        const raw = JSON.parse(data.toString());
        if (typeof raw?.requestId === "string" && raw.requestId.trim() && raw.requestId.length <= 128) requestId = raw.requestId;
      } catch { /* Invalid JSON has no trustworthy request identifier. */ }
      send(ws, { type: "error", code: "BAD_REQUEST", requestId, message: error instanceof Error ? error.message : String(error) });
      return;
    }
    if (message.type !== "init" && !initializedClients.has(ws)) {
      send(ws, {
        type: "error",
        code: "INIT_REQUIRED",
        requestId: message.requestId,
        message: `请先发送 init（protocolVersion: ${PROTOCOL_VERSION}）完成握手`,
      });
      return;
    }
    if (shuttingDown) { send(ws, { type: "error", code: "SERVICE_UNAVAILABLE", requestId: message.requestId, message: "服务正在关闭，请稍后重连" }); return; }
    const task = route(ws, auth, message).then(() => {
      // Prompts retain the stronger prompt_accepted confirmation after persistence.
      if (message.requestId && message.type !== "prompt") send(ws, {
        type: "ack", command: message.type, requestId: message.requestId,
        ...("sessionId" in message ? { sessionId: message.sessionId } : {}),
      });
    }).catch((error) => {
      send(ws, {
        type: "error",
        code: error instanceof WorkbenchAuthError ? error.code : error instanceof WorkbenchServiceError ? "SERVICE_UNAVAILABLE" : "REQUEST_FAILED",
        requestId: message.requestId,
        sessionId: "sessionId" in message ? message.sessionId : undefined,
        message: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof WorkbenchAuthError) {
        initializedClients.delete(ws);
        identities.delete(ws);
        ws.close(error.code === "FORBIDDEN" ? 4403 : 4401, "Workbench authentication failed");
      } else if (error instanceof WorkbenchServiceError) {
        initializedClients.delete(ws);
        ws.close(1013, "Workbench service unavailable");
      }
    }).finally(() => { activeRequests.delete(task); });
    activeRequests.add(task);
  });
  ws.on("close", () => {
    initializedClients.delete(ws);
    identities.delete(ws);
    resources.permissions.closeOwner(clientIds.get(ws)!);
    clients.delete(ws);
    auth.close();
    authInteractions.delete(auth);
  });
  ws.on("error", (error) => console.error("WebSocket error", error));
});

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const client of clients) client.close(1001, "Server shutting down");
  for (const auth of authInteractions) auth.close();
  const sessions = pool.values();
  for (const active of sessions) {
    active.role.controller.abort();
    resources.permissions.cancelSession(active.id);
  }
  let abortTimer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled([
      ...activeRequests,
      ...sessions.map(async active => {
        await active.session.abort();
        await active.promptTask;
        await active.operationTask;
      }),
    ]),
    new Promise<void>(done => { abortTimer = setTimeout(done, 5000); }),
  ]);
  clearTimeout(abortTimer);
  for (const active of pool.values()) {
    await persistSession(active).catch((error) => console.error(`Final persistence failed for ${active.id}`, error));
  }
  pool.close();
  const forceClose = setTimeout(() => { for (const client of clients) client.terminate(); }, 1000);
  forceClose.unref();
  wss.close();
  server.close();
  await Promise.allSettled([...pendingPersistence.values()]);
  await sessionStore.close();
}
process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });
console.log(`Pi Agent Gateway listening on http://${host}:${port} (Pi cwd: ${workspace}, sessions: MySQL)`);

