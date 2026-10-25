import assert from "node:assert/strict";
import test from "node:test";
import { historyPage } from "../src/lib/history-page.js";
import type { ChatMessage } from "../../shared/types.js";

test("history cursors stay stable when a live conversation grows", () => {
  const messages: ChatMessage[] = Array.from({ length: 95 }, (_, index) => ({ id: `message-${index}`, role: "user", text: String(index) }));
  const latest = historyPage(messages);
  assert.equal(latest.messages.length, 40);
  assert.equal(latest.nextBefore, "message-55");
  messages.push({ id: "message-95", role: "assistant", text: "new reply" });
  const older = historyPage(messages, latest.nextBefore);
  assert.deepEqual(older.messages.map(message => message.id), messages.slice(15, 55).map(message => message.id));
  const oldest = historyPage(messages, older.nextBefore);
  assert.equal(oldest.messages.length, 15);
  assert.equal(oldest.nextBefore, undefined);
  assert.equal(new Set([...oldest.messages, ...older.messages, ...latest.messages].map(message => message.id)).size, 95);
  assert.throws(() => historyPage(messages, "removed-by-compaction"), /历史记录已更新/);
  assert.deepEqual(historyPage([]), { messages: [], nextBefore: undefined });
});
