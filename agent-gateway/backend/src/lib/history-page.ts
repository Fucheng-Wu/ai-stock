import type { ChatMessage } from "../../../shared/types.js";

/** Stable message IDs avoid shifting offsets when a live answer grows. */
export function historyPage(messages: ChatMessage[], before?: string, limit = 40) {
  const end = before === undefined ? messages.length : messages.findIndex((message) => message.id === before);
  if (end < 0) throw new Error("历史记录已更新，请返回最新消息后重新加载。");
  const start = Math.max(0, end - limit);
  return { messages: messages.slice(start, end), nextBefore: start > 0 ? messages[start].id : undefined };
}
