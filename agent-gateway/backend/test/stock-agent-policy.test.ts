import assert from "node:assert/strict";
import { once } from "node:events";
import { access, mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { STOCK_TOOLS } from "../src/lib/agent-policy.js";
import { createPermissionExtension, PermissionBroker, type RoleRuntime } from "../src/lib/permissions.js";
import { PrimaryAgentRegistry } from "../src/lib/primary-agents.js";
import { createSession, resumeSessionFromDatabase, switchPrimaryAgent } from "../src/lib/session-factory.js";
import { createSharedResources } from "../src/lib/shared-resources.js";
import { buildPersistedRecord } from "../src/lib/session-record.js";
import { attachEventRelay } from "../src/lib/event-relay.js";
import { convertActiveMessages } from "../src/lib/message-converter.js";
import { runWithStockToolToken } from "../subagents/stock-analyst/tools.js";

async function guard(runtime: RoleRuntime, child?: Parameters<typeof createPermissionExtension>[3]) {
  let handler!: (event: ToolCallEvent) => Promise<{ block?: boolean } | undefined>;
  await createPermissionExtension(runtime, new PermissionBroker(), process.cwd(), child)({
    on: (_event: string, callback: typeof handler) => { handler = callback; },
  } as unknown as ExtensionAPI);
  return (toolName: string, input: Record<string, unknown> = {}) => handler({
    type: "tool_call", toolCallId: "test-call", toolName, input,
  } as ToolCallEvent);
}

async function runtime(): Promise<RoleRuntime> {
  return {
    sessionId: "test-session", controller: new AbortController(),
    profile: await new PrimaryAgentRegistry("unused", "unused").get("general"),
  };
}

test("primary permits only stock delegation, including when profile tools and permissions are widened", async () => {
  const role = await runtime();
  role.profile.tools = ["*"];
  role.profile.permissions = [{ action: "*", resource: "*", effect: "allow" }];
  const call = await guard(role);
  assert.equal(await call("Agent", { profile: "stock-analyst", task: "行情" }), undefined);
  for (const tool of ["read", "grep", "find", "ls", "write", "edit", "bash", "execute", "mcp", "web_fetch", ...STOCK_TOOLS]) {
    assert.equal((await call(tool, { path: "secret", query: "test" }))?.block, true, tool);
  }
  for (const profile of ["general-purpose", "explore", "plan", "build", "stock-analyst "]) {
    assert.equal((await call("Agent", { profile, task: "read files" }))?.block, true, profile);
  }
});

test("stock child permits business tools and web search but blocks internal tools and recursive delegation", async () => {
  const call = await guard(await runtime(), {
    id: "stock-analyst", name: "stock", tools: ["*"],
    permissions: [{ action: "*", resource: "*", effect: "allow" }],
  });
  for (const tool of STOCK_TOOLS) assert.equal(await call(tool, { query: "stock" }), undefined, tool);
  for (const tool of ["read", "grep", "find", "ls", "write", "edit", "bash", "execute", "Agent", "web_fetch", "mcp_read"]) {
    assert.equal((await call(tool))?.block, true, tool);
  }
  const unknown = await guard(await runtime(), { id: "explore", name: "explore", tools: ["*"] });
  assert.equal((await unknown("stock_quote"))?.block, true);
});

test("cancellation and parent deny rules also block otherwise permitted stock calls", async () => {
  const role = await runtime();
  const child = { id: "stock-analyst", name: "stock", tools: [...STOCK_TOOLS] };
  role.profile.permissions.push({ action: "stock_quote", resource: "*", effect: "deny" });
  const call = await guard(role, child);
  assert.equal((await call("stock_quote"))?.block, true);
  assert.equal(await call("stock_kline"), undefined);
  role.controller.abort();
  assert.equal((await call("stock_kline"))?.block, true);
});

async function listen(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return (server.address() as { port: number }).port;
}

test("real SDK delegates with isolated tools and injected skills, forwards identity, and restricts recovered sessions", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-agent-sdk-"));
  const agentDir = join(root, "agent");
  const saved = Object.fromEntries(["PI_AGENT_DIR", "AGENT_DEFAULT_MODEL", "DEEPSEEK_API_KEY", "STOCK_API_BASE_URL"].map((key) => [key, process.env[key]]));
  const requests: Array<Record<string, any>> = [];
  const token = "test-user-token-should-never-reach-model";
  const image = { type: "image" as const, mimeType: "image/png", data: "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAI0lEQVR4nGO0afrAQApgIkk1w6gG4gATkergYFQDMYDkUAIAVSsBzrxEmLQAAAAASUVORK5CYII=" };
  let stockRequests = 0;
  const stockServer = createServer((request, response) => {
    stockRequests++;
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    assert.equal(request.url, "/stock/analyzer/quote/sh600519");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ code: 200, data: { name: "测试股票", price: 100, time: "2026-10-24 15:00:00" } }));
  });
  let childFails = false;
  const modelServer = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    const toolNames = body.tools?.map((tool: any) => tool.function.name) ?? [];
    const primary = toolNames.includes("Agent");
    if (!primary && childFails) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "child model unavailable", type: "invalid_request_error" } }));
      return;
    }
    const afterTool = body.messages.at(-1)?.role === "tool";
    const tool = primary ? "Agent" : "stock_quote";
    const args = primary ? { profile: "stock-analyst", task: "查询 sh600519 最新行情并注明来源" } : { stockCode: "sh600519" };
    const delta = afterTool ? { content: primary ? "已取得股票子代理结果。" : "测试股票最新价100，来源腾讯行情。" } : {
      tool_calls: [{ index: 0, id: `call_${requests.length}`, type: "function", function: { name: tool, arguments: JSON.stringify(args) } }],
    };
    response.writeHead(200, { "content-type": "text/event-stream" });
    const chunk = (delta: unknown, finish: string | null) => `data: ${JSON.stringify({
      id: "reply", object: "chat.completion.chunk", created: 1, model: "gateway-test",
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;
    response.write(chunk(delta, null));
    response.write(chunk({}, afterTool ? "stop" : "tool_calls"));
    response.end("data: [DONE]\n\n");
  });
  const activeSessions: Awaited<ReturnType<typeof createSession>>[] = [];
  try {
    await mkdir(agentDir, { recursive: true });
    await mkdir(join(root, ".pi", "extensions"), { recursive: true });
    await writeFile(join(root, "AGENTS.md"), "PRIVATE_PROJECT_CONTEXT_MUST_NOT_APPEAR");
    await writeFile(join(root, ".pi", "APPEND_SYSTEM.md"), "PRIVATE_APPEND_PROMPT_MUST_NOT_APPEAR");
    await writeFile(join(root, ".pi", "extensions", "poison.ts"), 'throw new Error("AMBIENT_EXTENSION_MUST_NOT_LOAD");');
    const modelPort = await listen(modelServer);
    const stockPort = await listen(stockServer);
    await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: { deepseek: {
      baseUrl: `http://127.0.0.1:${modelPort}/v1`, api: "openai-completions", apiKey: "test-only",
      models: [{ id: "gateway-test", name: "Local test", input: ["text", "image"], reasoning: false, contextWindow: 32000, maxTokens: 1024 }],
    } } }));
    process.env.PI_AGENT_DIR = agentDir;
    process.env.AGENT_DEFAULT_MODEL = "gateway-test";
    process.env.DEEPSEEK_API_KEY = "test-only";
    process.env.STOCK_API_BASE_URL = `http://127.0.0.1:${stockPort}`;
    const resources = await createSharedResources(root);
    const active = await createSession(resources, "1");
    activeSessions.push(active);
    const otherUser = await createSession(resources, "2");
    activeSessions.push(otherUser);
    assert.equal(active.userId, "1");
    assert.equal(otherUser.userId, "2");
    assert.notEqual(dirname(active.manager.getSessionFile()!), dirname(otherUser.manager.getSessionFile()!));
    // Regression: a new Pi session has a path but no JSONL file yet.
    await assert.rejects(access(active.manager.getSessionFile()!), { code: "ENOENT" });
    const emptyRecord = buildPersistedRecord(active, root);
    assert.equal(emptyRecord.userId, "1");
    assert.deepEqual(emptyRecord.rawMessages, []);
    assert.equal(JSON.parse(emptyRecord.sessionJsonl!.split("\n")[0]).id, active.id);
    const restoredEmpty = await resumeSessionFromDatabase(resources, emptyRecord);
    activeSessions.push(restoredEmpty);
    assert.equal(restoredEmpty.id, active.id);
    assert.equal(restoredEmpty.userId, "1");
    assert.deepEqual(restoredEmpty.session.messages, []);
    assert.equal(restoredEmpty.session.model?.id, "gateway-test");
    assert.deepEqual(active.session.getActiveToolNames(), ["Agent"]);
    assert.equal(active.role.profile.id, "general");
    for (const id of ["build", "plan", "reviewer"]) await assert.rejects(switchPrimaryAgent(resources, active, id));
    let partialSnapshots = 0;
    let childUpdates = 0;
    let missingChildSnapshot = false;
    let rawChildOutput = false;
    let missingPartialSnapshot = false;
    attachEventRelay(active, event => {
      if (event.type === "tool_update" && event.subagent) {
        childUpdates++;
        if (event.output !== undefined) rawChildOutput = true;
        const tool = convertActiveMessages(active).flatMap(message => message.tools ?? []).find(tool => tool.id === event.toolCallId);
        if (JSON.stringify(tool?.subagent) !== JSON.stringify(event.subagent)) missingChildSnapshot = true;
      }
      if (event.type === "text_delta") {
        partialSnapshots++;
        if (!convertActiveMessages(active).at(-1)?.text.endsWith(event.delta)) missingPartialSnapshot = true;
      }
    });
    await runWithStockToolToken(token, () => active.session.prompt("查询600519行情", { expandPromptTemplates: false, images: [image] }));
    assert.ok(active.session.model?.input.includes("image"));
    assert.ok(convertActiveMessages(active)[0].images?.length, convertActiveMessages(active)[0].text);
    assert.ok(partialSnapshots > 0);
    assert.ok(childUpdates > 0);
    assert.equal(missingChildSnapshot, false, "reconnect snapshot lost child progress");
    assert.equal(rawChildOutput, false, "child progress must not be serialized as raw JSON output");
    assert.equal(missingPartialSnapshot, false, "live snapshot omitted the latest streamed text");
    assert.equal(stockRequests, 1);
    assert.equal(requests.length, 4);
    // Both primary and child must receive actual image content, not just a model's description.
    for (const body of requests) {
      assert.ok(body.messages.some((message: any) => message.role === "user" && Array.isArray(message.content)
        && message.content.some((block: any) => block.type === "image_url" && block.image_url.url.startsWith("data:image/png;base64,"))), JSON.stringify({ tools: body.tools.map((tool: any) => tool.function.name), messages: body.messages.map((message: any) => ({ role: message.role, content: typeof message.content === "string" ? "text" : message.content?.map((block: any) => ({ type: block.type, url: block.image_url?.url?.slice(0, 40) })) })) }));
    }
    for (const body of requests) {
      const names: string[] = body.tools.map((tool: any) => tool.function.name);
      assert.deepEqual([...names].sort(), names.includes("Agent") ? ["Agent"] : [...STOCK_TOOLS].sort());
      const serialized = JSON.stringify(body);
      assert.ok(!serialized.includes(token), "login identity leaked into the model request");
      assert.ok(!serialized.includes("PRIVATE_PROJECT_CONTEXT_MUST_NOT_APPEAR"));
      assert.ok(!serialized.includes("PRIVATE_APPEND_PROMPT_MUST_NOT_APPEAR"));
      if (!names.includes("Agent")) {
        assert.ok(serialized.includes("已加载技能：stock-520"));
        assert.ok(serialized.includes("已加载技能：stock-research"));
      }
    }
    assert.equal((await resources.features.getSubagentSettings()).active, 0);
    const child = convertActiveMessages(active).flatMap(message => message.tools ?? []).find(tool => tool.name === "Agent")?.subagent;
    assert.equal(child?.status, "done");
    assert.ok(child?.messages.some(message => message.role === "user" && message.images?.length === 1));
    assert.equal(convertActiveMessages(active)[0].images?.length, 1);
    assert.ok(child?.messages.some(message => message.text.includes("最新价100")));
    assert.ok(child?.messages.some(message => message.tools?.some(tool => tool.name === "stock_quote" && tool.status === "done")));
    // A missing local file must not prevent a complete backup and JSONL recovery.
    await unlink(active.manager.getSessionFile()!);
    const conversationRecord = buildPersistedRecord(active, root);
    assert.ok(!JSON.stringify(conversationRecord).includes(token));
    const restoredConversation = await resumeSessionFromDatabase(resources, conversationRecord);
    activeSessions.push(restoredConversation);
    // JSON persistence intentionally omits optional properties whose value is undefined.
    assert.deepEqual(restoredConversation.session.messages, JSON.parse(JSON.stringify(active.session.messages)));
    assert.equal(restoredConversation.userId, "1");
    assert.deepEqual(convertActiveMessages(restoredConversation).flatMap(message => message.tools ?? [])[0]?.subagent, JSON.parse(JSON.stringify(child)));
    // The SDK creates failed tool results itself; our tool_result hook must attach child details.
    childFails = true;
    await runWithStockToolToken(token, () => active.session.prompt("再查询一次行情", { expandPromptTemplates: false }));
    const secondChildRequest = requests.slice(4).find(body => !body.tools.some((tool: any) => tool.function.name === "Agent"));
    assert.ok(secondChildRequest);
    assert.ok(!JSON.stringify(secondChildRequest.messages).includes("data:image/"), "previous turn images must not leak into an unrelated child task");
    const failedTool = convertActiveMessages(active).flatMap(message => message.tools ?? []).at(-1);
    assert.equal(failedTool?.status, "error");
    assert.equal(failedTool?.subagent?.status, "error");
    assert.match(failedTool?.subagent?.error ?? "", /child model unavailable/);
    assert.equal((await resources.features.getSubagentSettings()).active, 0);
    const recovered = await resumeSessionFromDatabase(resources, {
      userId: "1",
      summary: { id: "restored-test", title: "恢复", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      workspace: root, rawMessages: [], model: { provider: "deepseek", id: "gateway-test" }, thinkingLevel: "off",
    });
    activeSessions.push(recovered);
    assert.equal(recovered.role.profile.id, "general");
    assert.deepEqual(recovered.session.getActiveToolNames(), ["Agent"]);
  } finally {
    for (const active of activeSessions) { active.session.dispose(); active.onDispose?.(); }
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    for (const server of [modelServer, stockServer]) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    assert.ok(root.startsWith(join(tmpdir(), "stock-agent-sdk-")));
    await rm(root, { recursive: true, force: true });
  }
});
