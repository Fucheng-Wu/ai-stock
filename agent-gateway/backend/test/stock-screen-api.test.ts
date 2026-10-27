import assert from "node:assert/strict";
import test from "node:test";
import { StockScreenApi } from "../src/lib/stock-screen-api.js";
import { runWithStockToolToken } from "../subagents/stock-analyst/tools.js";

test("MySQL screening API uses current prompt identity, fixed paths, escaped filters, and no snapshot fallback", async () => {
  const previousFetch = globalThis.fetch, previousUrl = process.env.STOCK_API_BASE_URL;
  let requested = "", fail = false;
  try {
    process.env.STOCK_API_BASE_URL = "http://127.0.0.1:8080/workbench";
    globalThis.fetch = async (url, init) => {
      requested = String(url);
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer mysql-screen-user-token");
      if (fail) return Response.json({ code: 403 });
      return Response.json({ code: 200, data: { snapshotId: "mysql-20261026-test", tradeDate: "2026-10-26", total: 43 } });
    };
    const api = new StockScreenApi();
    await assert.rejects(api.query(), /登录身份/);
    const result = await runWithStockToolToken("mysql-screen-user-token", () => api.query({ keyword: "A&B", page: 2 }));
    assert.equal(new URL(requested).pathname, "/workbench/stock/screener/results");
    assert.equal(new URL(requested).searchParams.get("keyword"), "A&B");
    assert.ok(!JSON.stringify(result).includes("mysql-screen-user-token"));
    await runWithStockToolToken("mysql-screen-user-token", () => api.detail("bj920000", { snapshotId: "mysql-20261026-test" }));
    assert.equal(new URL(requested).pathname, "/workbench/stock/screener/detail");
    fail = true;
    await assert.rejects(runWithStockToolToken("mysql-screen-user-token", () => api.query()), /股票分析权限/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.STOCK_API_BASE_URL; else process.env.STOCK_API_BASE_URL = previousUrl;
  }
});
