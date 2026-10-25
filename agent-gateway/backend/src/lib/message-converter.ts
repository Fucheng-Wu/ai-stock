import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { ChatMessage, ContextUsage, SubagentRun, ToolCall } from "../../../shared/types.js";
import type { ActiveSession } from "./types.js";

type RecordLike = Record<string, unknown>;

function record(value: unknown): RecordLike | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RecordLike
    : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((part) => {
      const block = record(part);
      return block?.type === "text" ? string(block.text) ?? "" : "";
    }).filter(Boolean).join("\n");
  }
  return "";
}

function timestamp(value: unknown): string | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function toolOutput(value: unknown): string {
  const item = record(value);
  if (!item) return "";
  const text = contentText(item.content);
  if (text) return text;
  if (item.details !== undefined) {
    try { return JSON.stringify(item.details, null, 2); } catch { /* ignored */ }
  }
  return "";
}

export function subagentFromResult(value: unknown): SubagentRun | undefined {
  const run = record(record(record(value)?.details)?.subagent);
  if (!run || typeof run.id !== "string" || typeof run.profile !== "string" || typeof run.name !== "string" || typeof run.task !== "string" || !Array.isArray(run.messages) || !["running", "done", "error"].includes(String(run.status))) return undefined;
  return run as unknown as SubagentRun;
}

/** Builds a transcript from the current Pi branch, joining tool results to their calls. */
export function convertMessages(messages: readonly unknown[], offset = 0): ChatMessage[] {
  const converted: ChatMessage[] = [];
  const tools = new Map<string, ToolCall>();
  let assistantTurn: ChatMessage | undefined;

  messages.forEach((raw, index) => {
    const item = record(raw);
    if (!item) return;
    const id = string(item.id) ?? `message-${index + offset}`;
    const at = timestamp(item.timestamp);

    if (item.role === "user") {
      assistantTurn = undefined;
      converted.push({ id, role: "user", text: contentText(item.content), timestamp: at });
      return;
    }

    if (item.role === "assistant") {
      const blocks = Array.isArray(item.content) ? item.content : [];
      const text: string[] = [];
      const thinking: string[] = [];
      const calls: ToolCall[] = [];
      for (const rawBlock of blocks) {
        const block = record(rawBlock);
        if (!block) continue;
        if (block.type === "text") text.push(string(block.text) ?? "");
        else if (block.type === "thinking") thinking.push(string(block.thinking) ?? "");
        else if (block.type === "toolCall") {
          const call: ToolCall = {
            id: string(block.id) ?? `tool-${index + offset}-${calls.length}`,
            name: string(block.name) ?? "tool",
            input: block.arguments,
            status: "running",
            startedAt: at,
          };
          calls.push(call);
          tools.set(call.id, call);
        }
      }
      const error = item.stopReason === "error" ? string(item.errorMessage) ?? "Model error" : undefined;
      if (!assistantTurn) {
        assistantTurn = {
          id,
          role: "assistant",
          text: "",
          timestamp: at,
        };
        converted.push(assistantTurn);
      }
      const nextText = text.join("");
      if (nextText) assistantTurn.text += `${assistantTurn.text ? "\n\n" : ""}${nextText}`;
      const nextThinking = thinking.join("");
      if (nextThinking) assistantTurn.thinking = `${assistantTurn.thinking ?? ""}${assistantTurn.thinking ? "\n\n" : ""}${nextThinking}`;
      if (calls.length) assistantTurn.tools = [...(assistantTurn.tools ?? []), ...calls];
      if (error) assistantTurn.error = error;
      return;
    }

    if (item.role === "toolResult") {
      const callId = string(item.toolCallId);
      const output = toolOutput(item);
      const call = callId ? tools.get(callId) : undefined;
      if (call) {
        call.output = output;
        const subagent = subagentFromResult(item);
        if (subagent) call.subagent = subagent;
        call.status = item.isError === true ? "error" : "done";
        if (typeof item.durationMs === "number") call.durationMs = item.durationMs;
      } else if (output) {
        assistantTurn = undefined;
        converted.push({ id, role: "tool", text: output, timestamp: at });
      }
    }
  });

  return converted;
}

export function titleFromMessages(messages: readonly ChatMessage[]): string {
  const first = messages.find((message) => message.role === "user" && message.text.trim());
  return first ? first.text.replace(/\s+/g, " ").trim().slice(0, 64) : "新对话";
}

/** Include the in-flight assistant and tool progress in reconnect snapshots. */
export function convertActiveMessages(active: Pick<ActiveSession, "session" | "pendingAssistant" | "toolProgress">): ChatMessage[] {
  const raw: unknown[] = [...active.session.messages];
  if (active.pendingAssistant && !raw.includes(active.pendingAssistant)) {
    const tail = record(raw.at(-1));
    const pending = record(active.pendingAssistant);
    if (tail?.role === "assistant" && pending?.timestamp !== undefined && pending.timestamp === tail.timestamp) raw[raw.length - 1] = active.pendingAssistant;
    else raw.push(active.pendingAssistant);
  }
  const messages = convertMessages(raw);
  if (active.toolProgress?.size) {
    for (const message of messages) for (const tool of message.tools || []) {
      const progress = active.toolProgress.get(tool.id);
      if (progress) Object.assign(tool, progress);
    }
  }
  return messages;
}

export function contextUsageFromSession(session: AgentSession): ContextUsage | undefined {
  const usage = session.getContextUsage();
  if (!usage || usage.contextWindow <= 0 || usage.tokens === null) return undefined;
  const usedTokens = usage.tokens;
  return {
    usedTokens,
    contextWindow: usage.contextWindow,
    percent: usage.percent ?? (usedTokens / usage.contextWindow) * 100,
  };
}

