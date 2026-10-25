import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import type { AgentUiEvent, ChatMessage } from "../../../shared/types.js";
import { contextUsageFromSession, convertMessages, subagentFromResult, titleFromMessages } from "./message-converter.js";
import type { ActiveSession } from "./types.js";

type SendEvent = (event: AgentUiEvent) => void;

function resultText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const item = value as { content?: unknown; details?: unknown };
    if (Array.isArray(item.content)) {
      const text = item.content
        .map((block) => block && typeof block === "object" && "text" in block ? String(block.text ?? "") : "")
        .filter(Boolean).join("\n");
      if (text) return text;
    }
    if (item.details !== undefined) {
      try { return JSON.stringify(item.details, null, 2); } catch { /* ignored */ }
    }
  }
  return "";
}

function finishedMessage(active: ActiveSession, raw: unknown): ChatMessage | undefined {
  const index = active.session.messages.lastIndexOf(raw as never);
  const role = raw && typeof raw === "object" && "role" in raw ? raw.role : undefined;
  if (index < 0 || (role !== "user" && role !== "assistant")) return undefined;
  let start = index;
  while (start > 0 && active.session.messages[start].role !== "user") start--;
  const messages = convertMessages(active.session.messages.slice(start, index + 1), start);
  for (const message of messages) for (const tool of message.tools ?? []) {
    const progress = active.toolProgress?.get(tool.id);
    if (progress) Object.assign(tool, progress);
  }
  return messages.at(-1);
}

export function attachEventRelay(
  active: ActiveSession,
  send: SendEvent,
  sendSnapshot?: () => void,
  persist?: () => void,
): void {
  let hasText = false;
  let hasThinking = false;
  let textBoundary = false;
  let thinkingBoundary = false;
  const toolStarts = new Map<string, number>();
  active.unsubscribe = active.session.subscribe((event: AgentSessionEvent) => {
    try {
      switch (event.type) {
        case "agent_start":
          active.pendingAssistant = undefined;
          active.toolProgress = new Map();
          toolStarts.clear();
          active.phase = "waiting";
          hasText = false;
          hasThinking = false;
          textBoundary = false;
          thinkingBoundary = false;
          send({ type: "agent_start", sessionId: active.id });
          break;
        case "message_start":
          if (event.message.role === "assistant") {
            active.pendingAssistant = event.message;
            textBoundary = hasText;
            thinkingBoundary = hasThinking;
          }
          break;
        case "message_update":
          active.pendingAssistant = event.message;
          if (event.assistantMessageEvent.type === "text_delta" && event.assistantMessageEvent.delta) {
            active.phase = "answering";
            send({ type: "text_delta", sessionId: active.id, delta: `${textBoundary ? "\n\n" : ""}${event.assistantMessageEvent.delta}` });
            textBoundary = false;
            hasText = true;
          } else if (event.assistantMessageEvent.type === "thinking_delta" && event.assistantMessageEvent.delta) {
            active.phase = "thinking";
            send({ type: "thinking_delta", sessionId: active.id, delta: `${thinkingBoundary ? "\n\n" : ""}${event.assistantMessageEvent.delta}` });
            thinkingBoundary = false;
            hasThinking = true;
          }
          break;
        case "tool_execution_start":
          active.phase = "tool";
          toolStarts.set(event.toolCallId, Date.now());
          active.toolProgress?.set(event.toolCallId, { status: "running", startedAt: new Date().toISOString() });
          send({
            type: "tool_start",
            sessionId: active.id,
            tool: {
              id: event.toolCallId,
              name: event.toolName,
              input: event.args,
              status: "running",
              startedAt: new Date().toISOString(),
            },
          });
          break;
        case "tool_execution_update": {
          const subagent = subagentFromResult(event.partialResult);
          active.toolProgress?.set(event.toolCallId, { ...active.toolProgress.get(event.toolCallId), ...(subagent ? { subagent } : { output: resultText(event.partialResult) }) });
          send({
            type: "tool_update",
            sessionId: active.id,
            toolCallId: event.toolCallId,
            output: subagent ? undefined : resultText(event.partialResult),
            ...(subagent ? { subagent } : {}),
          });
          break;
        }
        case "tool_execution_end": {
          const subagent = subagentFromResult(event.result) ?? active.toolProgress?.get(event.toolCallId)?.subagent;
          active.toolProgress?.set(event.toolCallId, {
            ...(subagent ? { subagent } : {}),
            status: event.isError ? "error" : "done", output: resultText(event.result),
            durationMs: toolStarts.has(event.toolCallId) ? Date.now() - toolStarts.get(event.toolCallId)! : undefined,
          });
          send({
            type: "tool_end",
            sessionId: active.id,
            toolCallId: event.toolCallId,
            output: resultText(event.result),
            isError: event.isError,
            ...(subagent ? { subagent } : {}),
            durationMs: toolStarts.has(event.toolCallId) ? Date.now() - toolStarts.get(event.toolCallId)! : undefined,
          });
          toolStarts.delete(event.toolCallId);
          if (!toolStarts.size) active.phase = "waiting";
          break;
        }
        case "message_end": {
          if (event.message.role === "assistant") active.pendingAssistant = undefined;
          const message = finishedMessage(active, event.message);
          if (!message) break;
          if (message.role === "assistant") {
            hasText = Boolean(message.text);
            hasThinking = Boolean(message.thinking);
          }
          send({ type: "message_end", sessionId: active.id, message });
          if (message.role === "user" && active.summary.title === "新对话") {
            const title = titleFromMessages([message]);
            if (title !== "新对话") {
              active.summary.title = title;
              active.manager.appendSessionInfo(title);
            }
          }
          active.summary.updatedAt = new Date().toISOString();
          active.summary.messageCount = active.session.messages.length;
          send({ type: "session_updated", sessionId: active.id, summary: active.summary });
          persist?.();
          break;
        }
        case "thinking_level_changed":
          send({ type: "session_updated", sessionId: active.id, thinkingLevel: active.session.thinkingLevel });
          persist?.();
          break;
        case "compaction_end":
          // Compaction can replace/prune messages, invalidating index-based UI IDs.
          sendSnapshot?.();
          persist?.();
          break;
        case "agent_end": {
          active.contextUsage = contextUsageFromSession(active.session);
          send({ type: "session_updated", sessionId: active.id, summary: active.summary, contextUsage: active.contextUsage });
          persist?.();
          break;
        }
      }
    } catch (error) {
      console.error("Failed to relay Pi event", error);
    }
  });
}

