import assert from "node:assert/strict";
import test from "node:test";
import { convertActiveMessages, convertMessages } from "../src/lib/message-converter.js";

test("combines tool calls and the final answer into one assistant turn", () => {
  const messages = convertMessages([
    { role: "user", content: "Can you search?", timestamp: 1 },
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "I will check." },
        { type: "toolCall", id: "call-1", name: "bash", arguments: { command: "first" } },
        { type: "toolCall", id: "call-2", name: "bash", arguments: { command: "second" } },
      ],
      stopReason: "toolUse",
      timestamp: 2,
    },
    { role: "toolResult", toolCallId: "call-1", content: [{ type: "text", text: "one" }], timestamp: 3, durationMs: 1234 },
    { role: "toolResult", toolCallId: "call-2", content: [{ type: "text", text: "two" }], timestamp: 4 },
    {
      role: "assistant",
      content: [{ type: "text", text: "Yes, I can." }],
      stopReason: "stop",
      timestamp: 5,
    },
  ]);

  assert.equal(messages.length, 2);
  assert.deepEqual(messages[1], {
    id: "message-1",
    role: "assistant",
    text: "Yes, I can.",
    thinking: "I will check.",
    tools: [
      { id: "call-1", name: "bash", input: { command: "first" }, output: "one", status: "done", startedAt: new Date(2).toISOString(), durationMs: 1234 },
      { id: "call-2", name: "bash", input: { command: "second" }, output: "two", status: "done", startedAt: new Date(2).toISOString() },
    ],
    timestamp: new Date(2).toISOString(),
  });
});

test("keeps Markdown paragraph boundaries between model outputs and separates user turns", () => {
  const messages = convertMessages([
    { role: "user", content: "分析股票", timestamp: 1 },
    { role: "assistant", content: [{ type: "text", text: "搜索完成，开始分析。" }, { type: "thinking", thinking: "先查询" }], timestamp: 2 },
    { role: "assistant", content: [{ type: "text", text: "# 分析报告\n\n趋势向下" }, { type: "thinking", thinking: "再分析" }], timestamp: 3 },
    { role: "user", content: "再看另一只", timestamp: 4 },
    { role: "assistant", content: [{ type: "text", text: "下一份报告" }], timestamp: 5 },
  ]);

  assert.equal(messages.length, 4);
  assert.equal(messages[1].text, "搜索完成，开始分析。\n\n# 分析报告\n\n趋势向下");
  assert.equal(messages[1].thinking, "先查询\n\n再分析");
  assert.equal(messages[3].text, "下一份报告");
});

test("converting only the current turn preserves global message IDs", () => {
  const raw = [
    { role: "user", content: "第一轮" },
    { role: "assistant", content: [{ type: "text", text: "旧回复" }] },
    { role: "user", content: "第二轮" },
    { role: "assistant", content: [{ type: "text", text: "新回复" }] },
  ];
  assert.deepEqual(convertMessages(raw.slice(2), 2), convertMessages(raw).slice(2));
});

test("reconnect snapshots include partial assistant text and tool progress without duplication", () => {
  const user = { role: "user", content: "分析", timestamp: 1 };
  const pending = { role: "assistant", timestamp: 2, content: [{ type: "text", text: "正在分析" }, { type: "toolCall", id: "quote", name: "stock_quote", arguments: { stockCode: "sh600519" } }] };
  const active = {
    session: { messages: [user] }, pendingAssistant: pending,
    toolProgress: new Map([["quote", { status: "running", output: "已获取部分数据" }]]),
  } as unknown as Parameters<typeof convertActiveMessages>[0];
  const first = convertActiveMessages(active);
  assert.equal(first.at(-1)!.text, "正在分析");
  assert.equal(first.at(-1)!.tools![0].output, "已获取部分数据");
  active.session.messages.push(pending as never);
  assert.deepEqual(convertActiveMessages(active), first);
  active.pendingAssistant = { ...pending, content: [{ type: "text", text: "更新后的部分回复" }] };
  assert.equal(convertActiveMessages(active).at(-1)!.text, "更新后的部分回复");
});
