import assert from "node:assert/strict";
import { once } from "node:events";
import { access, mkdtemp, mkdir, rm, unlink, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import type { ExtensionAPI, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { RESEARCH_TOOLS, STOCK_TOOLS } from "../src/lib/agent-policy.js";
import { createPermissionExtension, PermissionBroker, type RoleRuntime } from "../src/lib/permissions.js";
import { PrimaryAgentRegistry } from "../src/lib/primary-agents.js";
import { createSession, resumeSessionFromDatabase, switchPrimaryAgent } from "../src/lib/session-factory.js";
import { createSharedResources } from "../src/lib/shared-resources.js";
import { FeatureManager } from "../src/lib/feature-manager.js";
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

test("primary permits only stock and research delegation, even when profile capabilities are widened", async () => {
  const role = await runtime();
  role.profile.tools = ["*"];
  role.profile.permissions = [{ action: "*", resource: "*", effect: "allow" }];
  const call = await guard(role);
  assert.equal(await call("Agent", { profile: "stock-analyst", task: "行情" }), undefined);
  assert.equal(await call("Agent", { profile: "web-researcher", task: "公开信息" }), undefined);
  for (const tool of ["read", "grep", "find", "ls", "write", "edit", "bash", "execute", "mcp", "web_fetch", ...STOCK_TOOLS, ...RESEARCH_TOOLS]) {
    assert.equal((await call(tool, { path: "secret", query: "test" }))?.block, true, tool);
  }
  for (const profile of ["general-purpose", "explore", "plan", "build", "stock-analyst ", "web-researcher ", "WEB-RESEARCHER"]) {
    assert.equal((await call("Agent", { profile, task: "read files" }))?.block, true, profile);
  }
});

test("stock child permits only business tools and blocks web search and recursive delegation", async () => {
  const call = await guard(await runtime(), {
    id: "stock-analyst", name: "stock", tools: ["*"],
    permissions: [{ action: "*", resource: "*", effect: "allow" }],
  });
  for (const tool of STOCK_TOOLS) assert.equal(await call(tool, { query: "stock" }), undefined, tool);
  for (const tool of ["read", "grep", "find", "ls", "write", "edit", "bash", "execute", "Agent", "web_search", "web_fetch", "mcp_read"]) {
    assert.equal((await call(tool))?.block, true, tool);
  }
  const unknown = await guard(await runtime(), { id: "explore", name: "explore", tools: ["*"] });
  assert.equal((await unknown("stock_quote"))?.block, true);
});

test("research child permits only public search, regardless of widened profile capabilities", async () => {
  const role = await runtime();
  const call = await guard(role, {
    id: "web-researcher", name: "research", tools: ["*"],
    permissions: [{ action: "*", resource: "*", effect: "allow" }],
  });
  assert.equal(await call("web_search", { query: "公开信息" }), undefined);
  for (const tool of [...STOCK_TOOLS, "Agent", "read", "grep", "find", "ls", "write", "edit", "bash", "execute", "web_fetch", "mcp_read"]) {
    assert.equal((await call(tool))?.block, true, tool);
  }
  role.profile.permissions.push({ action: "web_search", resource: "*", effect: "deny" });
  assert.equal((await call("web_search", { query: "公开信息" }))?.block, true);
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
  const saved = Object.fromEntries(["PI_AGENT_DIR", "AGENT_DEFAULT_MODEL", "DEEPSEEK_API_KEY", "STOCK_API_BASE_URL", "TAVILY_API_KEY"].map((key) => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  let researchRequests = 0;
  globalThis.fetch = async (url, options) => {
    if (url !== "https://api.tavily.com/search") return originalFetch(url, options);
    researchRequests++;
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer test-search-key");
    assert.equal(JSON.parse(String(options?.body)).query, "公开技术资料");
    return new Response(JSON.stringify({ results: [{ title: "官方资料", url: "https://example.com/docs", content: "公开技术资料", published_date: "2026-10-24" }] }));
  };
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
  let requestedProfile = "stock-analyst";
  const modelServer = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    requests.push(body);
    const toolNames = body.tools?.map((tool: any) => tool.function.name) ?? [];
    const primary = toolNames.includes("Agent");
    const research = toolNames.includes("web_search");
    if (!primary && childFails) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "child model unavailable", type: "invalid_request_error" } }));
      return;
    }
    const afterTool = body.messages.at(-1)?.role === "tool";
    const tool = primary ? "Agent" : research ? "web_search" : "stock_quote";
    const args = primary ? { profile: requestedProfile, task: requestedProfile === "web-researcher" ? "检索公开技术资料并注明来源" : "查询 sh600519 最新行情并注明来源" } : research ? { query: "公开技术资料" } : { stockCode: "sh600519" };
    const delta = afterTool ? { content: primary ? "已取得子代理结果。" : research ? "公开技术资料，来源[官方资料](https://example.com/docs)，发布于2026-10-24。" : "测试股票最新价100，来源腾讯行情。" } : {
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
    process.env.TAVILY_API_KEY = "test-search-key";
    const resources = await createSharedResources(root);
    // Settings are persisted in a fixture backend, never in the checkout used by the running gateway.
    const fixtureBackend = join(root, "backend");
    for (const id of ["stock-analyst", "web-researcher"]) {
      await mkdir(join(fixtureBackend, "subagents", id), { recursive: true });
      await writeFile(join(fixtureBackend, "subagents", id, "agent.md"), [
        "---", `name: ${id}`, 'tools: ["*"]', 'skills: ["*"]', 'extensions: ["unsafe"]',
        'permissions: [{"action":"*","resource":"*","effect":"allow"}]', "---", "测试角色",
      ].join("\n"));
    }
    await mkdir(join(fixtureBackend, "skills", "web-research"), { recursive: true });
    await writeFile(join(fixtureBackend, "skills", "web-research", "SKILL.md"), "---\nname: web-research\ndescription: 测试检索\n---\n仅检索公开资料。");
    const features = new FeatureManager(root, agentDir, resources.settingsManager, resources.modelRuntime, fixtureBackend, resources.permissions);
    let settings = await features.getSubagentSettings();
    assert.deepEqual(settings.profiles.map(profile => profile.id), ["stock-analyst", "web-researcher"]);
    assert.deepEqual(settings.profiles.map(profile => profile.tools), [STOCK_TOOLS, RESEARCH_TOOLS]);
    assert.deepEqual(settings.profiles.map(profile => profile.skills), [["stock-520"], ["web-research"]]);
    assert.ok(settings.profiles.every(profile => profile.extensions?.length === 0 && profile.permissions?.[0].effect === "deny"));
    await features.setSubagentProfileEnabled("web-researcher", false);
    settings = await features.getSubagentSettings();
    assert.deepEqual(settings.profiles.map(profile => profile.enabled), [true, false]);
    await features.setSubagentProfileEnabled("web-researcher", true);
    await features.setSubagentProfileEnabled("stock-analyst", false);
    settings = await features.getSubagentSettings();
    assert.deepEqual(settings.profiles.map(profile => profile.enabled), [false, true]);
    for (const id of ["stock-analyst", "web-researcher"]) await assert.rejects(features.deleteSubagentProfile(id), /不能删除/);
    // The tool schema exposes only the currently enabled researcher.
    const researchOnly = await createSession({ ...resources, features }, "1");
    activeSessions.push(researchOnly);
    requestedProfile = "web-researcher";
    await researchOnly.session.prompt("检索公开技术资料", { expandPromptTemplates: false });
    const schema = requests[0].tools[0].function.parameters.properties.profile;
    assert.deepEqual(schema.anyOf.map((option: { const: string }) => option.const), ["web-researcher"]);
    assert.equal(researchRequests, 1);
    // Existing sessions must also honor a role disabled after their tool schema was registered.
    await features.setSubagentProfileEnabled("web-researcher", false);
    await researchOnly.session.prompt("再次检索", { expandPromptTemplates: false });
    assert.equal(researchRequests, 1);
    assert.match(convertActiveMessages(researchOnly).flatMap(message => message.tools ?? []).at(-1)?.output ?? "", /子代理角色不可用/);
    requests.length = 0;
    researchRequests = 0;
    requestedProfile = "stock-analyst";
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
        assert.ok(!serialized.includes("已加载技能：web-research"));
        assert.ok(!serialized.includes("已加载技能：stock-research"));
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
    // The same real SDK session can delegate non-stock research, with no stock tools or skills.
    requestedProfile = "web-researcher";
    const beforeResearch = requests.length;
    await runWithStockToolToken(token, () => active.session.prompt("检索公开技术资料", { expandPromptTemplates: false }));
    const researchBodies = requests.slice(beforeResearch);
    assert.equal(researchBodies.length, 4);
    for (const body of researchBodies) {
      const names: string[] = body.tools.map((tool: any) => tool.function.name);
      assert.deepEqual([...names].sort(), names.includes("Agent") ? ["Agent"] : [...RESEARCH_TOOLS]);
      const serialized = JSON.stringify(body);
      assert.ok(!serialized.includes(token));
      assert.ok(!serialized.includes("test-search-key"));
      assert.ok(!serialized.includes("PRIVATE_PROJECT_CONTEXT_MUST_NOT_APPEAR"));
      assert.ok(!serialized.includes("PRIVATE_APPEND_PROMPT_MUST_NOT_APPEAR"));
      if (!names.includes("Agent")) {
        assert.ok(serialized.includes("已加载技能：web-research"));
        assert.ok(!serialized.includes("已加载技能：stock-520"));
        assert.ok(!serialized.includes("data:image/"), "previous turn images leaked into research");
      }
    }
    assert.equal(stockRequests, 1, "research must not query the stock service");
    assert.equal(researchRequests, 1);
    const researchRun = convertActiveMessages(active).flatMap(message => message.tools ?? []).at(-1)?.subagent;
    assert.equal(researchRun?.profile, "web-researcher");
    assert.equal(researchRun?.name, "信息检索");
    assert.equal(researchRun?.status, "done");
    assert.ok(researchRun?.messages.some(message => message.tools?.some(tool => tool.name === "web_search" && tool.status === "done")));
    const restoredResearch = await resumeSessionFromDatabase(resources, { ...buildPersistedRecord(active, root), sessionPath: undefined });
    activeSessions.push(restoredResearch);
    assert.deepEqual(convertActiveMessages(restoredResearch).flatMap(message => message.tools ?? []).at(-1)?.subagent, JSON.parse(JSON.stringify(researchRun)));
    assert.equal((await resources.features.getSubagentSettings()).active, 0);
    // The SDK creates failed tool results itself; our tool_result hook must attach child details.
    requestedProfile = "stock-analyst";
    childFails = true;
    const beforeFailure = requests.length;
    await runWithStockToolToken(token, () => active.session.prompt("再查询一次行情", { expandPromptTemplates: false }));
    const secondChildRequest = requests.slice(beforeFailure).find(body => !body.tools.some((tool: any) => tool.function.name === "Agent"));
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
    globalThis.fetch = originalFetch;
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
