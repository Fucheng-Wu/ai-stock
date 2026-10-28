import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createStockPortfolioToolsExtension } from "../subagents/stock-portfolio/tools.js";
import { createTodoToolsExtension } from "../subagents/todo-recorder/tools.js";
import { runWithWorkbenchToolToken } from "../src/lib/workbench-api.js";

test("personal lists use current identity and list permissions, paginate/filter, and never expose internal fields", async () => {
  const savedFetch = globalThis.fetch, savedUrl = process.env.STOCK_API_BASE_URL;
  const tools = new Map<string, any>();
  const calls: Array<{ path: string; token: string | null }> = [];
  let permissions = ["agent:chat:use", "stock:watchlist:list", "stock:position:list", "todo:task:list"];
  const watchlist = Array.from({ length: 23 }, (_, i) => ({ watchlistId: i + 1, stockCode: `sh${600000 + i}`,
    stockName: `自选${i}`, userId: 9, createBy: "private-account", params: { token: "private-token" } }));
  const datasets: Record<string, unknown> = {
    "/workbench/stock/watchlist/list": watchlist,
    "/workbench/stock/position/list": [{ positionId: 1, stockCode: "sz000001", stockName: "平安银行",
      costPrice: "12.30", quantity: 250, positionPct: 18, userId: 9 }],
    "/workbench/todo/task/list": [
      { taskId: 1, content: "买牛奶", category: "生活", status: "0", userId: 9 },
      { taskId: 2, content: "读书", category: "学习", status: "0", userId: 9 },
      { taskId: 3, content: "买菜", category: "生活", status: "1", userId: 9 },
    ],
  };
  let readResponse: (() => Promise<Response>) | undefined;
  try {
    process.env.STOCK_API_BASE_URL = "http://127.0.0.1:8080/workbench";
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input)), token = new Headers(init?.headers).get("Authorization");
      calls.push({ path: url.pathname, token });
      assert.equal(init?.redirect, "error");
      assert.ok(!init?.body, "list queries must never write");
      assert.equal(url.search, "", "model userId/URL must never reach Java");
      if (url.pathname.endsWith("/getInfo")) return Response.json({ code: 200, user: { userId: 9 }, permissions });
      assert.equal(init?.method, "GET");
      assert.ok(Object.hasOwn(datasets, url.pathname), `Unexpected path: ${url.pathname}`);
      return readResponse ? readResponse() : Response.json({ code: 200, data: datasets[url.pathname] });
    };
    const api = { registerTool: (tool: any) => tools.set(tool.name, tool) } as unknown as ExtensionAPI;
    await createStockPortfolioToolsExtension()(api);
    await createTodoToolsExtension()(api);
    const read = (name: string, params: Record<string, unknown> = {}, token = "user-9-secret", signal?: AbortSignal) =>
      runWithWorkbenchToolToken(token, async () => {
        const result = await tools.get(name).execute("query", params, signal);
        assert.ok(!JSON.stringify(result).includes(token));
        assert.ok(!JSON.stringify(result).includes("private-token"));
        return JSON.parse(result.content[0].text);
      });
    const first = await read("stock_watchlist_list", { userId: 999, url: "https://bad.example" });
    assert.equal(first.operation, "list");
    assert.equal(first.total, 23);
    assert.equal(first.items.length, 20);
    assert.equal(first.page, 1);
    assert.equal(first.hasMore, true);
    assert.deepEqual(first.items[0], { watchlistId: 1, stockCode: "sh600000", stockName: "自选0" });
    const second = await read("stock_watchlist_list", { page: 2 });
    assert.equal(second.items.length, 3);
    assert.equal(second.hasMore, false);
    const beyond = await read("stock_watchlist_list", { page: 3 });
    assert.equal(beyond.total, 23);
    assert.deepEqual(beyond.items, []);
    assert.equal((await read("stock_watchlist_list", { keyword: "SH600000" })).total, 1);
    const position = await read("stock_position_list");
    assert.deepEqual(position.items[0], { positionId: 1, stockCode: "sz000001", stockName: "平安银行", costPrice: "12.30", quantity: 250 });
    const allTodos = await read("todo_list");
    assert.equal(allTodos.total, 3, "default includes all categories and statuses");
    const pending = await read("todo_list", { category: "生活", status: "0", keyword: "奶" });
    assert.equal(pending.total, 1);
    assert.equal(pending.totalRecords, 3);
    assert.deepEqual(pending.items[0], { taskId: 1, content: "买牛奶", category: "生活", status: "0" });
    assert.equal((await read("todo_list", { status: "1" })).items[0].content, "买菜");
    assert.equal((await read("todo_list", { keyword: "不存在" })).total, 0);
    assert.ok(calls.every(call => call.token === "Bearer user-9-secret"));

    const beforeInvalid = calls.length;
    for (const tool of ["stock_watchlist_list", "stock_position_list", "todo_list"]) {
      for (const params of [{ page: 0 }, { page: 1.5 }, { page: 1_000_001 }, { pageSize: 0 }, { pageSize: 101 }, { keyword: 7 }, { keyword: "x".repeat(101) }]) {
        await assert.rejects(read(tool, params), /页码|每页|关键词/);
      }
      await assert.rejects(tools.get(tool).execute("query", {}), /登录身份/);
    }
    await assert.rejects(read("todo_list", { category: "其他" }), /分类/);
    await assert.rejects(read("todo_list", { status: "done" }), /状态/);
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(read("todo_list", {}, "user-9-secret", cancelled.signal));
    assert.equal(calls.length, beforeInvalid);

    // Each query checks the specific list permission and chat permission; add rights alone cannot read.
    for (const [tool, permission] of [["stock_watchlist_list", "stock:watchlist:list"], ["stock_position_list", "stock:position:list"], ["todo_list", "todo:task:list"]]) {
      permissions = ["agent:chat:use", "stock:watchlist:add", "stock:position:add", "todo:task:add"];
      const before = calls.filter(call => !call.path.endsWith("/getInfo")).length;
      await assert.rejects(read(tool), new RegExp(permission));
      assert.equal(calls.filter(call => !call.path.endsWith("/getInfo")).length, before);
      permissions = [permission];
      await assert.rejects(read(tool), /agent:chat:use/);
      permissions = ["agent:chat:use", permission];
      await read(tool);
    }
    permissions = ["*:*:*"];
    for (const malformed of [null, {}, { rows: [] }, [null], [{}]]) {
      readResponse = async () => Response.json({ code: 200, data: malformed });
      await assert.rejects(read("todo_list"), /格式无效|未返回数据/);
    }
    for (const [response, message] of [
      [() => Response.json({ code: 401 }), /登录已失效/],
      [() => Response.json({ code: 403 }), /todo:task:list/],
      [() => new Response("bad", { status: 502 }), /HTTP 502/],
      [() => new Response("broken json"), /有效 JSON/],
    ] as const) {
      readResponse = async () => response();
      await assert.rejects(read("todo_list"), message);
    }
    readResponse = async () => { throw new TypeError("network failure"); };
    await assert.rejects(read("todo_list"), /无法连接/);
    readResponse = undefined;
    datasets["/workbench/todo/task/list"] = [];
    assert.equal((await read("todo_list")).total, 0, "only a valid empty array is an empty list");

    // Concurrent requests retain their own credentials throughout authentication and business reads.
    calls.length = 0;
    await Promise.all([read("stock_position_list", {}, "user-A"), read("todo_list", {}, "user-B")]);
    assert.equal(calls.find(call => call.path.endsWith("/stock/position/list"))?.token, "Bearer user-A");
    assert.equal(calls.find(call => call.path.endsWith("/todo/task/list"))?.token, "Bearer user-B");
  } finally {
    globalThis.fetch = savedFetch;
    if (savedUrl === undefined) delete process.env.STOCK_API_BASE_URL; else process.env.STOCK_API_BASE_URL = savedUrl;
  }
});
