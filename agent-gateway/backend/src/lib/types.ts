import type { AgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import type { ContextUsage, SessionSummary, ThinkingLevel } from "../../../shared/types.js";
import type { RoleRuntime } from "./permissions.js";

export interface ActiveSession {
  id: string;
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
  summary: SessionSummary;
  workspace: string;
  sessionPath?: string;
  sessionJsonl?: string;
  rawMessages: unknown[];
  model?: { provider: string; id: string };
  thinkingLevel: ThinkingLevel;
  contextUsage?: ContextUsage;
}

