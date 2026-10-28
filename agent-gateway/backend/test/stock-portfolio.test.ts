import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createStockPortfolioToolsExtension } from "../subagents/stock-portfolio/tools.js";
import { runWithStockToolToken } from "../subagents/stock-analyst/tools.js";

test("portfolio tools use fixed APIs, current user permissions, exact position data, and confirmed mutation responses", async () => {
  const savedFetch = globalThis.fetch, savedUrl = process.env.STOCK_API_BASE_URL;
  const tools = new Map<string, any>();
  const calls: Array<{ path: string; init?: RequestInit; token: string | null }> = [];
  let permissions = ["agent:chat:use", "stock:watchlist:add", "stock:position:add"];
  let writeResponse = () => Promise.resolve(Response.json({ code: 200, msg: "操作成功" }));
  try {
    process.env.STOCK_API_BASE_URL = "http://127.0.0.1:8080/workbench";
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      const token = new Headers(init?.headers).get("Authorization");
      calls.push({ path, init, token });
      assert.equal(init?.redirect, "error");
      if (path.endsWith("/getInfo")) return Response.json({ code: 200, user: { userId: 9 }, permissions });
      if (path.includes("/stock/analyzer/search")) return Response.json({ code: 200, data: [
        { code: "sh600519", name: "贵州茅台", market: "sh", securityType: "stock", exactMatch: true },
      ] });
      assert.ok(["/workbench/stock/watchlist", "/workbench/stock/position"].includes(path));
      assert.equal(init?.method, "POST");
      return writeResponse();
    };
    await createStockPortfolioToolsExtension()({ registerTool: (tool: any) => tools.set(tool.name, tool) } as unknown as ExtensionAPI);
    assert.deepEqual([...tools.keys()], ["stock_search", "stock_watchlist_add", "stock_position_add", "stock_watchlist_list", "stock_position_list"]);
    const add = (name: string, params: Record<string, unknown>, signal?: AbortSignal, token = "user-9-secret") =>
      runWithStockToolToken(token, () => tools.get(name).execute("call", params, signal));
    const position = { stockCode: " SZ000001 ", costPrice: "12.30", quantity: 250 };
    const first = await add("stock_position_add", { ...position, userId: 999, stockName: "伪造名称", url: "https://bad.example" });
    assert.deepEqual(JSON.parse(String(calls.at(-1)?.init?.body)), { stockCode: "sz000001", costPrice: "12.30", quantity: 250 });
    assert.ok(calls.every(call => call.token === "Bearer user-9-secret"));
    assert.deepEqual(JSON.parse(first.content[0].text), { success: true, target: "position", stockCode: "sz000001", costPrice: "12.30", quantity: 250 });
    assert.ok(!JSON.stringify(first).includes("user-9-secret"));
    const watch = await add("stock_watchlist_add", { stockCode: "600519" });
    assert.equal(calls.at(-1)?.path, "/workbench/stock/watchlist");
    assert.deepEqual(JSON.parse(String(calls.at(-1)?.init?.body)), { stockCode: "sh600519" });
    assert.equal(JSON.parse(watch.content[0].text).success, true, "empty-data Java success must be accepted");

    const beforeInvalid = calls.length;
    for (const costPrice of [undefined, "0", "-1", "1.234", "NaN", "1e2", "100000000000000.00", 12.3]) {
      await assert.rejects(add("stock_position_add", { ...position, costPrice }), /成本价/);
    }
    for (const quantity of [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await assert.rejects(add("stock_position_add", { ...position, quantity }), /股数/);
    }
    for (const stockCode of ["贵州茅台", "bj920000", "../../file", "https://bad.example"]) {
      await assert.rejects(add("stock_watchlist_add", { stockCode }), /沪深/);
    }
    assert.equal(calls.length, beforeInvalid, "invalid inputs must never reach auth or write APIs");
    await assert.rejects(tools.get("stock_watchlist_add").execute("call", { stockCode: "600519" }), /登录身份/);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(add("stock_watchlist_add", { stockCode: "600519" }, controller.signal));
    assert.equal(calls.length, beforeInvalid);

    // Every write revalidates chat and the specific add permission, without requiring list permission.
    permissions = ["agent:chat:use", "stock:watchlist:add"];
    const writes = () => calls.filter(call => call.init?.method === "POST").length;
    const beforeDenied = writes();
    await assert.rejects(add("stock_position_add", position), /stock:position:add/);
    assert.equal(writes(), beforeDenied);
    await add("stock_watchlist_add", { stockCode: "600519" });
    permissions = ["stock:position:add"];
    await assert.rejects(add("stock_position_add", position), /agent:chat:use/);
    permissions = ["agent:chat:use", "stock:position:add", "stock:watchlist:add"];
    const search = await add("stock_search", { keyword: "贵州茅台" });
    assert.equal(JSON.parse(search.content[0].text).data.resolvedStockCode, "sh600519");

    writeResponse = async () => Response.json({ code: 500, msg: "该股票已在自选列表中" });
    const beforeDuplicate = writes();
    await assert.rejects(add("stock_watchlist_add", { stockCode: "600519" }), /已在自选/);
    assert.equal(writes(), beforeDuplicate + 1, "duplicate must not cause update, remove, or retry");
    for (const response of [() => Response.json({ code: 403 }), () => new Response("", { status: 403 })]) {
      writeResponse = async () => response();
      await assert.rejects(add("stock_position_add", position), /stock:position:add/);
    }
    writeResponse = async () => Response.json({ code: 401 });
    await assert.rejects(add("stock_watchlist_add", { stockCode: "600519" }), /登录已失效/);
    for (const response of [
      async () => { throw new TypeError("network failure"); },
      async () => new Response("bad", { status: 502 }),
      async () => new Response("not json"),
    ]) {
      writeResponse = response;
      const beforeUnknown = writes();
      await assert.rejects(add("stock_watchlist_add", { stockCode: "600519" }), /结果尚未确认/);
      assert.equal(writes(), beforeUnknown + 1, "uncertain writes must not retry");
    }

    writeResponse = async () => Response.json({ code: 200 });
    calls.length = 0;
    await Promise.all([
      add("stock_watchlist_add", { stockCode: "600519" }, undefined, "user-A"),
      add("stock_position_add", position, undefined, "user-B"),
    ]);
    assert.equal(calls.find(call => call.path.endsWith("/stock/watchlist"))?.token, "Bearer user-A");
    assert.equal(calls.find(call => call.path.endsWith("/stock/position"))?.token, "Bearer user-B");
  } finally {
    globalThis.fetch = savedFetch;
    if (savedUrl === undefined) delete process.env.STOCK_API_BASE_URL; else process.env.STOCK_API_BASE_URL = savedUrl;
  }
});
