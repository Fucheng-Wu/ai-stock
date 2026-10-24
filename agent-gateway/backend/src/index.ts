import { readFile, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { WebSocket, WebSocketServer } from "ws";
import { PROTOCOL_VERSION, type AgentUiEvent, type ClientMessage, type ServerMessage, type SessionSnapshot, type SessionSummary, type ThinkingLevel } from "../../shared/types.js";
import { WsAuthInteraction } from "./lib/auth-bridge.js";
import { loadGatewayEnvironment, MySqlSessionStore } from "./lib/database.js";
import { attachEventRelay } from "./lib/event-relay.js";
import { contextUsageFromSession, convertMessages } from "./lib/message-converter.js";
import { ModelManager } from "./lib/model-manager.js";
import {
  createSession,
  listStoredSessions,
  recordFromStoredSession,
  resumeSession,
  resumeSessionFromDatabase,
  sessionDir,
  runSessionOperation,
  switchPrimaryAgent,
} from "./lib/session-factory.js";
import { SessionPool } from "./lib/session-pool.js";
import { createSharedResources } from "./lib/shared-resources.js";
import { runWithStockToolToken } from "../subagents/stock-analyst/tools.js";
import type { ActiveSession, PersistedSessionRecord } from "./lib/types.js";

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
const pendingLoads = new Map<string, Promise<ActiveSession>>();
const pendingPersistence = new Map<string, Promise<void>>();
const deletedSessionIds = new Set<string>();
const clientIds = new WeakMap<WebSocket, string>();
resources.permissions.setNotifier((owner, message) => {
  for (const ws of clients) if (clientIds.get(ws) === owner && initializedClients.has(ws)) send(ws, message);
});

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(message: ServerMessage): void {
  for (const ws of clients) {
    if (initializedClients.has(ws)) send(ws, message);
  }
}

function broadcastEvent(event: AgentUiEvent): void {
  broadcast(event);
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

async function buildPersistedRecord(active: ActiveSession): Promise<PersistedSessionRecord> {
  const model = active.session.model;
  const sessionPath = active.manager.getSessionFile();
  let sessionJsonl: string | undefined;
  if (sessionPath) {
    try { sessionJsonl = await readFile(sessionPath, "utf8"); }
    catch (error) { console.warn(`Failed to read session JSONL for ${active.id}`, error); }
  }
  return {
    summary: {
      ...active.summary,
      messageCount: active.session.messages.length,
    },
    workspace,
    sessionPath,
    sessionJsonl,
    rawMessages: [...active.session.messages],
    model: model ? { provider: model.provider, id: model.id } : undefined,
    thinkingLevel: active.session.thinkingLevel as ThinkingLevel,
    contextUsage: active.contextUsage || contextUsageFromSession(active.session),
  };
}

function persistSession(active: ActiveSession): Promise<void> {
  const previous = pendingPersistence.get(active.id) || Promise.resolve();
  const task = previous.catch(() => undefined).then(async () => {
    if (deletedSessionIds.has(active.id)) return;
    await sessionStore.save(await buildPersistedRecord(active));
  });
  pendingPersistence.set(active.id, task);
  const cleanup = () => {
    if (pendingPersistence.get(active.id) === task) pendingPersistence.delete(active.id);
  };
  task.then(cleanup, cleanup);
  return task;
}

function schedulePersistence(active: ActiveSession): void {
  void persistSession(active).catch((error) => {
    console.error(`Failed to persist Agent session ${active.id} to MySQL`, error);
  });
}

function attach(active: ActiveSession): ActiveSession {
  pool.add(active);
  attachEventRelay(
    active,
    broadcastEvent,
    () => broadcast({ type: "session_state", session: snapshot(active) }),
    () => schedulePersistence(active),
  );
  return active;
}

async function getSession(sessionId: string): Promise<ActiveSession> {
  const loaded = pool.get(sessionId);
  if (loaded) return loaded;
  const pending = pendingLoads.get(sessionId);
  if (pending) return pending;
  const task = (async () => {
    const record = await sessionStore.get(workspace, sessionId);
    const info = (await listStoredSessions(resources)).find((item) => item.id === sessionId);
    if (!info && !record) throw new Error("会话不存在");
    const active = info
      ? await resumeSession(resources, info)
      : await resumeSessionFromDatabase(resources, record!);
    if (record) {
      active.summary = { ...record.summary };
      active.contextUsage = record.contextUsage || active.contextUsage;
    }
    attach(active);
    schedulePersistence(active);
    return active;
  })();
  pendingLoads.set(sessionId, task);
  try { return await task; }
  finally { pendingLoads.delete(sessionId); }
}

function snapshot(active: ActiveSession): SessionSnapshot {
  const model = active.session.model;
  return {
    summary: active.summary,
    messages: convertMessages(active.session.messages),
    model: model ? { provider: model.provider, id: model.id } : undefined,
    thinkingLevel: active.session.thinkingLevel as ThinkingLevel,
    isStreaming: active.session.isStreaming || !!active.promptTask,
    contextUsage: contextUsageFromSession(active.session),
    primaryAgentId: active.role.profile.id,
  };
}

async function listSessions(): Promise<SessionSummary[]> {
  const stored = await sessionStore.list(workspace);
  const byId = new Map<string, SessionSummary>();
  for (const item of stored) byId.set(item.id, item);
  for (const active of pool.values()) byId.set(active.id, active.summary);
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function migrateLocalSessionsToDatabase(): Promise<void> {
  const [databaseSessions, localSessions] = await Promise.all([
    sessionStore.list(workspace),
    listStoredSessions(resources),
  ]);
  const databaseIds = new Set(databaseSessions.map((item) => item.id));
  let imported = 0;
  for (const info of localSessions) {
    if (databaseIds.has(info.id)) continue;
    let record: PersistedSessionRecord;
    try { record = await recordFromStoredSession(resources, info); }
    catch (error) {
      console.warn(`Skipped unreadable local Agent session ${info.id}`, error);
      continue;
    }
    await sessionStore.save(record);
    imported += 1;
  }
  if (imported > 0) console.log(`Imported ${imported} local Agent session(s) into MySQL`);
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
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof (parsed as { type?: unknown }).type !== "string") {
    throw new Error("消息缺少 type 字段");
  }
  const requestId = (parsed as { requestId?: unknown }).requestId;
  if (requestId !== undefined && (typeof requestId !== "string" || requestId.length > 128)) {
    throw new Error("requestId 无效");
  }
  return parsed as ClientMessage;
}

function lastPromptError(active: ActiveSession): string | undefined {
  const last = [...active.session.messages].reverse().find((item) => item.role === "assistant");
  return last?.role === "assistant" && last.stopReason === "error"
    ? last.errorMessage || "模型调用失败"
    : undefined;
}

function startPrompt(ws: WebSocket, active: ActiveSession, text: string, requestId?: string, stockAccessToken?: string): void {
  if (active.promptTask || active.operationTask || !active.session.isIdle) throw new Error("此会话正在工作，请等待或先取消");
  active.role.controller = new AbortController();
  resources.permissions.setOwner(active.id, clientIds.get(ws)!);
  const task = runWithStockToolToken(stockAccessToken, () => active.session.prompt(text, { expandPromptTemplates: false }))
    .then(() => {
      active.contextUsage = contextUsageFromSession(active.session);
      broadcastEvent({
        type: "agent_end", sessionId: active.id, contextUsage: active.contextUsage, error: lastPromptError(active),
      });
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      send(ws, { type: "error", message, sessionId: active.id, requestId });
      broadcastEvent({
        type: "agent_end", sessionId: active.id, contextUsage: contextUsageFromSession(active.session), error: message,
      });
    })
    .finally(() => {
      resources.permissions.cancelSession(active.id, "本轮任务已结束");
      active.promptTask = undefined;
      active.summary.updatedAt = new Date().toISOString();
      active.summary.messageCount = active.session.messages.length;
      active.contextUsage = contextUsageFromSession(active.session);
      schedulePersistence(active);
    });
  active.promptTask = task;
}

function validDeletePath(path: string): boolean {
  const base = resolve(sessionDir(resources));
  const target = resolve(path);
  const rel = relative(base, target);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) && target.endsWith(".jsonl");
}

async function deleteSession(sessionId: string): Promise<void> {
  await pendingLoads.get(sessionId);
  const record = await sessionStore.get(workspace, sessionId);
  const info = (await listStoredSessions(resources)).find((item) => item.id === sessionId);
  const active = pool.get(sessionId);
  await active?.operationTask;
  if (!info && !active && !record) throw new Error("会话不存在");
  active?.role.controller.abort();
  resources.permissions.cancelSession(sessionId);
  if (active?.session.isStreaming) await active.session.abort();
  await active?.promptTask;
  const pending = pendingPersistence.get(sessionId);
  if (pending) await pending.catch(() => undefined);
  deletedSessionIds.add(sessionId);
  pool.remove(sessionId);
  await sessionStore.delete(workspace, sessionId);
  const candidatePaths = new Set([info?.path, active?.manager.getSessionFile(), record?.sessionPath].filter(Boolean) as string[]);
  for (const path of candidatePaths) {
    if (!validDeletePath(path)) continue;
    try { await unlink(path); }
    catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code !== "ENOENT") throw error;
    }
  }
  broadcast({ type: "session_deleted", sessionId });
  broadcast({ type: "sessions", sessions: await listSessions() });
}

await migrateLocalSessionsToDatabase();

async function route(ws: WebSocket, auth: WsAuthInteraction, message: ClientMessage): Promise<void> {
  const requestId = message.requestId;
  switch (message.type) {
    case "init": {
      if (message.protocolVersion !== PROTOCOL_VERSION) {
        throw new Error(`协议版本不兼容：客户端 ${message.protocolVersion}，服务端 ${PROTOCOL_VERSION}`);
      }
      const [sessions, settings, primaryAgents] = await Promise.all([listSessions(), resources.features.getSettings(), resources.primaryAgents.list()]);
      send(ws, {
        type: "init",
        protocolVersion: PROTOCOL_VERSION,
        sessions,
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
    case "list_sessions": send(ws, { type: "sessions", sessions: await listSessions(), requestId }); return;
    case "create_session": {
      const active = attach(await createSession(resources));
      await persistSession(active);
      send(ws, { type: "session_created", session: snapshot(active), requestId });
      broadcast({ type: "sessions", sessions: await listSessions() });
      return;
    }
    case "list_primary_agents":
      send(ws, { type: "primary_agents", agents: await resources.primaryAgents.list(), requestId });
      return;
    case "set_primary_agent": {
      const active = await getSession(requireText(message.sessionId, "sessionId", 128));
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
      const active = await getSession(requireText(message.sessionId, "sessionId", 128));
      send(ws, { type: "session_state", session: snapshot(active), requestId });
      return;
    }
    case "delete_session":
      await deleteSession(requireText(message.sessionId, "sessionId", 128));
      return;
    case "prompt": {
      const active = await getSession(requireText(message.sessionId, "sessionId", 128));
      const stockAccessToken = message.stockAccessToken === undefined
        ? undefined
        : requireText(message.stockAccessToken, "stockAccessToken", 8192);
      await persistSession(active);
      startPrompt(ws, active, requireText(message.text, "text"), requestId, stockAccessToken);
      return;
    }
    case "abort": {
      const active = await getSession(requireText(message.sessionId, "sessionId", 128));
      active.role.controller.abort();
      resources.permissions.cancelSession(active.id);
      await active.session.abort();
      await active.promptTask;
      await persistSession(active);
      return;
    }
    case "set_model": {
      const active = await getSession(requireText(message.sessionId, "sessionId", 128));
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
      const active = await getSession(requireText(message.sessionId, "sessionId", 128));
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
const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });

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
  if (pathname !== "/ws" || !acceptedOrigin(request.headers.origin)) {
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
  ws.on("message", (data) => {
    let message: ClientMessage;
    try { message = parseClientMessage(data); }
    catch (error) {
      send(ws, { type: "error", code: "BAD_REQUEST", message: error instanceof Error ? error.message : String(error) });
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
    void route(ws, auth, message).catch((error) => {
      send(ws, {
        type: "error",
        code: "REQUEST_FAILED",
        requestId: message.requestId,
        sessionId: "sessionId" in message ? message.sessionId : undefined,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  });
  ws.on("close", () => { resources.permissions.closeOwner(clientIds.get(ws)!); clients.delete(ws); auth.close(); });
  ws.on("error", (error) => console.error("WebSocket error", error));
});

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const client of clients) client.close(1001, "Server shutting down");
  for (const active of pool.values()) {
    active.role.controller.abort();
    resources.permissions.cancelSession(active.id);
    await active.operationTask?.catch(() => undefined);
    if (active.session.isStreaming) await active.session.abort().catch(() => undefined);
    await active.promptTask?.catch(() => undefined);
    await persistSession(active).catch((error) => console.error(`Final persistence failed for ${active.id}`, error));
  }
  pool.close();
  wss.close();
  server.close();
  await Promise.allSettled([...pendingPersistence.values()]);
  await sessionStore.close();
}
process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });
console.log(`Pi Agent Gateway listening on http://${host}:${port} (Pi cwd: ${workspace}, sessions: MySQL)`);

