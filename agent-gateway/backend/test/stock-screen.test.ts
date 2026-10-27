import assert from "node:assert/strict";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StockScreenStore } from "../src/lib/stock-screen-store.js";
import { createStockScreenToolsExtension } from "../subagents/stock-screener/tools.js";
import { runWithStockToolToken } from "../subagents/stock-analyst/tools.js";
import { writeScreenFixture } from "./helpers/stock-screen-fixture.js";

test("screen filters and pages use stable snapshots and never reveal internal paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-screen-"));
  try {
    const first = await writeScreenFixture(root);
    const store = new StockScreenStore(root);
    const all = await store.query({ pageSize: 2 });
    assert.equal(all.total, 3); assert.equal(all.coverage.universe, 5); assert.equal(all.hasNextPage, true);
    assert.deepEqual(all.rows.map(row => row.stockCode), ["bj920000", "sh600519"]);
    assert.ok(!JSON.stringify(all).includes("PRIVATE_"));
    assert.equal((await store.query({ signal: "GOLDEN_CROSS", excludeST: true })).total, 1);
    assert.equal((await store.query({ signal: "RETRACE", exchange: "bj" })).total, 1);
    assert.equal((await store.query({ keyword: "沪市" })).rows[0].stockCode, "sh600519");
    assert.equal((await store.query({ keyword: "does-not-match" })).total, 0);
    const second = await writeScreenFixture(root, "b");
    assert.equal((await store.query()).snapshotId, second.id);
    const oldPage = await store.query({ snapshotId: first.id, page: 2, pageSize: 2 });
    assert.equal(oldPage.snapshotId, first.id);
    assert.deepEqual(oldPage.rows.map(row => row.stockCode), ["sz000001"]);
    const oldDetail = await store.detail("sh600519", { snapshotId: first.id });
    assert.equal(oldDetail.snapshotId, first.id); assert.equal(oldDetail.found, true);
    const noncandidate = await store.detail("000002", { snapshotId: first.id });
    assert.equal(noncandidate.found, true); assert.deepEqual(noncandidate.record?.signals, []);
    const excluded = await store.detail("sz000003");
    assert.equal(excluded.record?.status, "excluded");
    assert.equal(excluded.record?.lastDate, "2026-10-23");
    assert.equal((await store.detail("sz000009")).found, false);
    await assert.rejects(store.query({ tradeDate: "2026-10-27" }), /没有.*2026-10-27/);
    await assert.rejects(store.query({ tradeDate: "2026-02-30" }), /有效/);
    await assert.rejects(store.query({ snapshotId: "../../private" }), /snapshotId/);
    await assert.rejects(store.detail("../../private"), /代码/);
    await assert.rejects(store.query({ pageSize: 51 }), /pageSize/);
    await assert.rejects(store.query({ page: 0 }), /page/);
    await assert.rejects(store.query({ snapshotId: first.id, tradeDate: "2026-10-25" }), /不一致/);
    // A dated request can retrieve a saved historical snapshot without substituting another day.
    const historical = await writeScreenFixture(root, "c", "2026-10-23");
    await writeFile(join(root, "latest.json"), JSON.stringify(second.report));
    assert.equal((await store.query({ tradeDate: "2026-10-23" })).snapshotId, historical.id);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("corrupt, partial and missing snapshots fail rather than becoming zero matches", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-screen-errors-"));
  try {
    const fixture = await writeScreenFixture(root);
    await writeFile(join(fixture.directory, "candidates.json"), "[]");
    await assert.rejects(new StockScreenStore(root).query(), /数量不一致/);
    await writeFile(join(fixture.directory, "candidates.json"), "broken");
    await assert.rejects(new StockScreenStore(root).query(), /格式损坏/);
    await writeFile(join(fixture.directory, "report.json"), JSON.stringify({ ...fixture.report, state: "partial" }));
    await assert.rejects(new StockScreenStore(root).query(), /元数据无效/);
    await assert.rejects(new StockScreenStore(join(root, "missing")).query(), /尚未准备好/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("fixed snapshot files cannot escape through directory symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-screen-links-"));
  const outside = await mkdtemp(join(tmpdir(), "stock-screen-outside-"));
  try {
    const fixture = await writeScreenFixture(outside);
    await writeFile(join(root, "latest.json"), JSON.stringify(fixture.report));
    await symlink(fixture.directory, join(root, fixture.id), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(new StockScreenStore(root).query(), /超出允许范围/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("screen tools recheck current permissions, isolate identity, and honor cancellation", async () => {
  const root = await mkdtemp(join(tmpdir(), "stock-screen-auth-"));
  const previousFetch = globalThis.fetch;
  const previousUrl = process.env.STOCK_API_BASE_URL;
  const registered = new Map<string, any>();
  let reads = 0, permission = true;
  try {
    await writeScreenFixture(root);
    process.env.STOCK_API_BASE_URL = "http://127.0.0.1:8080/workbench";
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), "http://127.0.0.1:8080/workbench/getInfo");
      assert.equal(init?.redirect, "error");
      const token = new Headers(init?.headers).get("Authorization");
      await new Promise(resolve => setTimeout(resolve, token?.includes("user-a") ? 10 : 1));
      if (token?.includes("expired")) return Response.json({ code: 401 });
      return Response.json({ code: 200, user: { userId: token?.includes("user-a") ? 1 : 2 },
        permissions: ["agent:chat:use", ...(permission && token?.includes("user-a") ? ["stock:analyzer:analyze"] : [])] });
    };
    const store = new StockScreenStore(root);
    const original = store.query.bind(store);
    store.query = async (...args) => { reads++; return original(...args); };
    await createStockScreenToolsExtension(store)({ registerTool: (tool: any) => registered.set(tool.name, tool) } as unknown as ExtensionAPI);
    assert.deepEqual([...registered.keys()], ["stock_screen", "stock_screen_detail"]);
    const call = (token?: string, args = {}) => runWithStockToolToken(token, () => registered.get("stock_screen").execute("test", args));
    await assert.rejects(call(), /登录身份/); assert.equal(reads, 0);
    const parallel = await Promise.allSettled([call("user-a-secret"), call("user-b-secret")]);
    assert.equal(parallel[0].status, "fulfilled"); assert.equal(parallel[1].status, "rejected");
    assert.equal(reads, 1);
    assert.ok(!JSON.stringify(parallel[0]).includes("secret"));
    permission = false;
    await assert.rejects(call("user-a-secret"), /stock:analyzer:analyze/); assert.equal(reads, 1);
    await assert.rejects(call("expired-secret"), /失效/);
    const aborted = new AbortController(); aborted.abort();
    await assert.rejects(runWithStockToolToken("user-a-secret", () => registered.get("stock_screen_detail").execute("detail", { stockCode: "sh600519" }, aborted.signal)));
    assert.equal(reads, 1);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.STOCK_API_BASE_URL; else process.env.STOCK_API_BASE_URL = previousUrl;
    await rm(root, { recursive: true, force: true });
  }
});
