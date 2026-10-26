import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createWebSearchExtension } from "../subagents/web-researcher/web-search.js";

async function searchTool() {
  let tool: any;
  await createWebSearchExtension()({ registerTool: (registered: unknown) => { tool = registered; } } as unknown as ExtensionAPI);
  return tool;
}

test("web search without a server key fails before making a request", async () => {
  const saved = process.env.TAVILY_API_KEY;
  const originalFetch = globalThis.fetch;
  let requested = false;
  delete process.env.TAVILY_API_KEY;
  globalThis.fetch = async () => { requested = true; throw new Error("unexpected network request"); };
  try {
    await assert.rejects((await searchTool()).execute("call", { query: "股票" }), /TAVILY_API_KEY/);
    assert.equal(requested, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (saved === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = saved;
  }
});

test("web search fixes the external endpoint, keeps the key out of results, and filters unsafe links", async () => {
  const saved = process.env.TAVILY_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.TAVILY_API_KEY = "test-secret-key";
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://api.tavily.com/search");
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer test-secret-key");
    assert.equal(options?.redirect, "error");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.query, "股票公告");
    assert.equal(body.topic, "news");
    assert.ok(!String(options?.body).includes("test-secret-key"));
    return new Response(JSON.stringify({ results: [
      { title: "公告", url: "https://example.com/announcement", content: "公开摘要", published_date: "2026-10-24" },
      { title: "local", url: "file:///private" },
      { title: "script", url: "javascript:alert(1)" },
      { title: "credential", url: "https://user:password@example.com" },
    ] }), { status: 200 });
  };
  try {
    const result = await (await searchTool()).execute("call", { query: " 股票公告 ", topic: "news", maxResults: 5 });
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.results.length, 1);
    assert.equal(payload.results[0].publishedAt, "2026-10-24");
    assert.ok(!JSON.stringify(result).includes("test-secret-key"));
  } finally {
    globalThis.fetch = originalFetch;
    if (saved === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = saved;
  }
});

test("web search reports provider errors and cancellation without echoing response bodies", async () => {
  const saved = process.env.TAVILY_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.TAVILY_API_KEY = "test-secret-key";
  try {
    const tool = await searchTool();
    for (const status of [401, 429, 500]) {
      globalThis.fetch = async () => new Response("private-provider-response", { status });
      await assert.rejects(tool.execute("call", { query: "stock" }), (error: Error) => {
        assert.ok(!error.message.includes("private-provider-response"));
        assert.ok(!error.message.includes("test-secret-key"));
        return true;
      });
    }
    const controller = new AbortController();
    globalThis.fetch = async (_url, options) => {
      controller.abort();
      assert.equal(options?.signal?.aborted, true);
      throw new Error("aborted");
    };
    await assert.rejects(tool.execute("call", { query: "stock" }, controller.signal), /已取消/);
  } finally {
    globalThis.fetch = originalFetch;
    if (saved === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = saved;
  }
});
