import assert from "node:assert/strict";
import test from "node:test";
import { MySqlSessionStore } from "../src/lib/database.js";

test("session search, cursor pagination and rename retain user and workspace boundaries", async () => {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  let rows: unknown[] = Array.from({ length: 31 }, (_, index) => ({
    session_id: `session-${index}`, user_id: "42", workspace: "workspace", title: "测试对话",
    updated_at: "2026-10-25 03:00:00.123", created_at: "2026-10-25 02:00:00.000", message_count: 2,
  }));
  let affectedRows = 1;
  const store = Object.create(MySqlSessionStore.prototype) as MySqlSessionStore;
  Object.assign(store, { pool: { execute: async (sql: string, values: unknown[]) => {
    calls.push({ sql, values });
    return [sql.startsWith("UPDATE") ? { affectedRows } : rows];
  } } });
  const page = await store.list("workspace", "42", "520_%!");
  assert.equal(page.sessions.length, 30);
  assert.ok(page.nextCursor);
  assert.match(calls[0].sql, /workspace_key = \? AND user_id = \?/);
  assert.match(calls[0].sql, /LIMIT 31/);
  assert.equal(calls[0].values[1], "42");
  assert.equal(calls[0].values[2], "%520!_!%!!%");
  rows = [];
  const next = await store.list("workspace", "42", "520_%!", page.nextCursor);
  assert.equal(next.nextCursor, undefined);
  assert.deepEqual(calls[1].values.slice(-3), ["2026-10-25 03:00:00.123", "2026-10-25 03:00:00.123", "session-29"]);
  await assert.rejects(store.list("workspace", "42", "", "invalid-cursor"), /分页游标无效/);
  await store.rename("workspace", "42", "session-1", "新标题");
  assert.match(calls.at(-1)!.sql, /WHERE workspace_key = \? AND user_id = \? AND session_id = \?/);
  assert.deepEqual(calls.at(-1)!.values.slice(2), ["42", "session-1"]);
  affectedRows = 0;
  await assert.rejects(store.rename("workspace", "42", "someone-elses-session", "新标题"), /无权访问/);
});
