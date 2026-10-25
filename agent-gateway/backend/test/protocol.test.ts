import assert from "node:assert/strict";
import test from "node:test";
import { validateClientMessage } from "../../shared/validation.js";
import { MAX_BUFFERED_BYTES, sendEncoded } from "../src/lib/transport.js";

test("wire validation checks payloads and never enables upstream filesystem commands", () => {
  assert.equal(validateClientMessage({ type: "init", protocolVersion: 1, accessToken: "user-token" }).type, "init");
  assert.equal(validateClientMessage({ type: "list_sessions", query: "", cursor: undefined }).type, "list_sessions");
  assert.equal(validateClientMessage({ type: "rename_session", sessionId: "session", title: "新标题" }).type, "rename_session");
  for (const value of [null, [], { type: "__proto__" }, { type: "init", protocolVersion: 1 },
    { type: "prompt", sessionId: "session", text: 123 }, { type: "prompt", sessionId: "session", text: "   " },
    { type: "load_session", sessionId: "session", before: 123 }, { type: "rename_session", sessionId: "session", title: "x".repeat(65) },
    { type: "list_sessions", query: "x".repeat(101) }, { type: "ping", requestId: " " },
    { type: "set_subagent_settings", maxConcurrent: 100 }, { type: "set_thinking_level", sessionId: "s", level: "unbounded" }]) {
    assert.throws(() => validateClientMessage(value));
  }
  for (const type of ["get_workspace", "browse_directories", "set_workspace", "run_review", "read", "bash"]) {
    assert.throws(() => validateClientMessage({ type, path: "C:/private", requestId: "request" }), /不支持/);
  }
});

test("slow or closed clients cannot accumulate an unlimited outgoing queue", () => {
  const sent: string[] = [];
  const closed: unknown[] = [];
  const socket = {
    readyState: 1, bufferedAmount: 0,
    send(value: string) { sent.push(value); },
    close(code: number, reason: string) { closed.push({ code, reason }); },
  };
  const send = () => sendEncoded(socket as Parameters<typeof sendEncoded>[0], '{"type":"pong"}');
  assert.equal(send(), true);
  socket.bufferedAmount = MAX_BUFFERED_BYTES + 1;
  assert.equal(send(), false);
  assert.equal(sent.length, 1);
  assert.equal((closed[0] as { code: number }).code, 1013);
  socket.readyState = 3;
  assert.equal(send(), false);
  assert.equal(closed.length, 1);
});
