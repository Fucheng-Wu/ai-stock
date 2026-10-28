import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createTodoToolsExtension } from "../subagents/todo-recorder/tools.js";
import { runWithWorkbenchToolToken } from "../src/lib/workbench-api.js";

test("todo additions validate content and categories, use current identity, and send only supported fields", async () => {
  const savedFetch = globalThis.fetch, savedUrl = process.env.STOCK_API_BASE_URL;
  const tools = new Map<string, any>();
  const calls: Array<{ path: string; init?: RequestInit; token: string | null }> = [];
  let permissions = ["agent:chat:use", "todo:task:add"];
  let authResult = { code: 200 };
  let addResponse = async () => Response.json({ code: 200, msg: "操作成功" });
  try {
    process.env.STOCK_API_BASE_URL = "http://127.0.0.1:8080/workbench";
    globalThis.fetch = async (input, init) => {
      const path = new URL(String(input)).pathname;
      const token = new Headers(init?.headers).get("Authorization");
      calls.push({ path, init, token });
      assert.equal(init?.redirect, "error");
      if (path === "/workbench/getInfo") return Response.json({ ...authResult, user: { userId: 9 }, permissions });
      assert.equal(path, "/workbench/todo/task");
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("Content-Type"), "application/json");
      return addResponse();
    };
    await createTodoToolsExtension()({ registerTool: (tool: any) => tools.set(tool.name, tool) } as unknown as ExtensionAPI);
    assert.deepEqual([...tools.keys()], ["todo_add", "todo_list"]);
    const tool = tools.get("todo_add");
    const add = (params: Record<string, unknown>, signal?: AbortSignal, token = "todo-user-secret") =>
      runWithWorkbenchToolToken(token, () => tool.execute("call", params, signal));
    const writes = () => calls.filter(call => call.init?.method === "POST");
    const first = await add({ content: "  明天买牛奶  ", category: "生活", userId: 999, status: "1", dueDate: "2026-10-29", url: "https://bad.example" });
    assert.deepEqual(JSON.parse(String(writes().at(-1)?.init?.body)), { content: "明天买牛奶", category: "生活" });
    assert.ok(calls.every(call => call.token === "Bearer todo-user-secret"));
    assert.deepEqual(JSON.parse(first.content[0].text), { success: true, target: "todo", content: "明天买牛奶", category: "生活", status: "0" });
    assert.ok(!JSON.stringify(first).includes("todo-user-secret"));
    const fallback = await add({ content: "整理资料" });
    assert.equal(JSON.parse(fallback.content[0].text).category, "工作");
    for (const category of ["工作", "学习", "生活"]) {
      await add({ content: "x".repeat(500), category });
      assert.equal(JSON.parse(String(writes().at(-1)?.init?.body)).category, category);
    }
    const beforeInvalid = calls.length;
    for (const content of [undefined, null, 42, "", " \n\t ", "x".repeat(501)]) {
      await assert.rejects(add({ content }), /待办内容/);
    }
    for (const category of [null, 7, "", "其他", "生活 ", "全部"]) {
      await assert.rejects(add({ content: "买菜", category }), /分类/);
    }
    await assert.rejects(tool.execute("call", { content: "买菜" }), /登录身份/);
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(add({ content: "买菜" }, aborted.signal));
    assert.equal(calls.length, beforeInvalid, "invalid or pre-cancelled calls must not touch backend APIs");

    const beforeDenied = writes().length;
    permissions = ["agent:chat:use", "todo:task:list", "stock:analyzer:analyze"];
    await assert.rejects(add({ content: "买菜" }), /todo:task:add/);
    permissions = ["todo:task:add"];
    await assert.rejects(add({ content: "买菜" }), /agent:chat:use/);
    assert.equal(writes().length, beforeDenied, "no POST before both permissions are checked");
    permissions = ["agent:chat:use", "todo:task:add"];
    authResult = { code: 401 };
    await assert.rejects(add({ content: "买菜" }), /登录已失效/);
    assert.equal(writes().length, beforeDenied);
    authResult = { code: 200 };
    for (const response of [
      async () => Response.json({ code: 403 }),
      async () => new Response("", { status: 403 }),
    ]) {
      addResponse = response;
      await assert.rejects(add({ content: "买菜" }), /todo:task:add/);
    }
    addResponse = async () => Response.json({ code: 401 });
    await assert.rejects(add({ content: "买菜" }), /登录已失效/);
    addResponse = async () => Response.json({ code: 500, msg: "待办内容不能为空" });
    await assert.rejects(add({ content: "买菜" }), /待办内容不能为空/);
    for (const response of [
      async () => { throw new TypeError("network failure"); },
      async () => new Response("", { status: 502 }),
      async () => new Response("broken json"),
      async () => Response.json({ msg: "操作成功" }),
      async () => Response.json(null),
    ]) {
      addResponse = response;
      const beforeUnknown = writes().length;
      await assert.rejects(add({ content: "买菜" }), /结果尚未确认.*个人待办清单/);
      assert.equal(writes().length, beforeUnknown + 1, "uncertain additions cannot be retried automatically");
    }
    // Cancellation during authentication is still before the write boundary.
    const cancelBeforeWrite = new AbortController();
    const previousMock = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const response = await previousMock(input, init);
      if (String(input).endsWith("/getInfo")) cancelBeforeWrite.abort();
      return response;
    };
    const beforeCancel = writes().length;
    await assert.rejects(add({ content: "买菜" }, cancelBeforeWrite.signal));
    assert.equal(writes().length, beforeCancel);
    globalThis.fetch = previousMock;

    addResponse = async () => Response.json({ code: 200 });
    calls.length = 0;
    await Promise.all([
      add({ content: "用户A事项", category: "工作" }, undefined, "user-A"),
      add({ content: "用户B事项", category: "学习" }, undefined, "user-B"),
    ]);
    assert.equal(writes().find(call => JSON.parse(String(call.init?.body)).content === "用户A事项")?.token, "Bearer user-A");
    assert.equal(writes().find(call => JSON.parse(String(call.init?.body)).content === "用户B事项")?.token, "Bearer user-B");
  } finally {
    globalThis.fetch = savedFetch;
    if (savedUrl === undefined) delete process.env.STOCK_API_BASE_URL; else process.env.STOCK_API_BASE_URL = savedUrl;
  }
});
