import type { AgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import type { ContextUsage, SessionSummary, ThinkingLevel, ToolCall } from "../../../shared/types.js";
import type { RoleRuntime } from "./permissions.js";

export interface ActiveSession {
  id: string;
  userId: string;
  epoch?: string;
  sequence?: number;
  pendingAssistant?: unknown;
  toolProgress?: Map<string, Partial<ToolCall>>;
  phase?: "waiting" | "thinking" | "tool" | "answering";
  startedAt?: string;
  session: AgentSession;
  manager: SessionManager;
  summary: SessionSummary;
  contextUsage?: ContextUsage;
  lastAccessAt: number;
  unsubscribe?: () => void;
  promptTask?: Promise<void>;
  operationTask?: Promise<unknown>;
  role: RoleRuntime;
  onDispose?: () => void;
}

export interface PersistedSessionRecord {
  userId: string;
  summary: SessionSummary;
  workspace: string;
  sessionPath?: string;
  sessionJsonl?: string;
  rawMessages: unknown[];
  model?: { provider: string; id: string };
  thinkingLevel: ThinkingLevel;
  contextUsage?: ContextUsage;
}

