import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import type { ContextUsage, SessionSummary, ThinkingLevel } from "../../../shared/types.js";
import type { PersistedSessionRecord } from "./types.js";

interface SessionRow extends RowDataPacket {
  session_id: string;
  workspace: string;
  title: string;
  session_path: string | null;
  session_jsonl: string | null;
  model_provider: string | null;
  model_id: string | null;
  thinking_level: ThinkingLevel;
  transcript_json: string;
  context_usage_json: string | null;
  message_count: number;
  created_at: string | Date;
  updated_at: string | Date;
}

export function loadGatewayEnvironment(): void {
  const gatewayRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const envPath = resolve(gatewayRoot, ".env");
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function workspaceKey(workspace: string): string {
  return createHash("sha256").update(workspace).digest("hex");
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; }
  catch { return fallback; }
}

function toIso(value: string | Date): string {
  if (value instanceof Date) return value.toISOString();
  const normalized = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function summaryFromRow(row: SessionRow): SessionSummary {
  return {
    id: row.session_id,
    title: row.title,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    messageCount: Number(row.message_count || 0),
  };
}

export class MySqlSessionStore {
  private readonly pool: Pool;

  constructor() {
    loadGatewayEnvironment();
    this.pool = mysql.createPool({
      host: process.env.AGENT_DB_HOST || "127.0.0.1",
      port: Number(process.env.AGENT_DB_PORT || 3306),
      user: process.env.AGENT_DB_USER || "root",
      password: process.env.AGENT_DB_PASSWORD || "",
      database: process.env.AGENT_DB_NAME || "ai_stock",
      charset: "utf8mb4",
      timezone: "Z",
      dateStrings: true,
      waitForConnections: true,
      connectionLimit: Number(process.env.AGENT_DB_CONNECTION_LIMIT || 5),
      queueLimit: 0,
    });
  }

  async initialize(): Promise<void> {
    await this.pool.query("SELECT 1");
    try {
      await this.pool.query("SELECT session_id FROM agent_chat_session LIMIT 0");
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code !== "ER_NO_SUCH_TABLE") throw error;
      await this.pool.execute(`
        CREATE TABLE agent_chat_session (
          session_id varchar(128) NOT NULL,
          workspace_key char(64) NOT NULL,
          workspace varchar(1024) NOT NULL,
          title varchar(255) NOT NULL DEFAULT '新对话',
          session_path varchar(2048) DEFAULT NULL,
          session_jsonl longtext DEFAULT NULL,
          model_provider varchar(128) DEFAULT NULL,
          model_id varchar(255) DEFAULT NULL,
          thinking_level varchar(16) NOT NULL DEFAULT 'medium',
          transcript_json longtext NOT NULL,
          context_usage_json text DEFAULT NULL,
          message_count int NOT NULL DEFAULT 0,
          created_at datetime(3) NOT NULL,
          updated_at datetime(3) NOT NULL,
          PRIMARY KEY (session_id),
          KEY idx_agent_chat_workspace_updated (workspace_key, updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent会话持久化'
      `);
    }
  }

  async list(workspace: string): Promise<SessionSummary[]> {
    const [rows] = await this.pool.execute<SessionRow[]>(
      `SELECT session_id, workspace, title, session_path, NULL AS session_jsonl,
              model_provider, model_id, thinking_level, '[]' AS transcript_json,
              context_usage_json, message_count, created_at, updated_at
         FROM agent_chat_session
        WHERE workspace_key = ?
        ORDER BY updated_at DESC`,
      [workspaceKey(workspace)],
    );
    return rows.map(summaryFromRow);
  }

  async get(workspace: string, sessionId: string): Promise<PersistedSessionRecord | undefined> {
    const [rows] = await this.pool.execute<SessionRow[]>(
      `SELECT session_id, workspace, title, session_path, session_jsonl,
              model_provider, model_id, thinking_level, transcript_json,
              context_usage_json, message_count, created_at, updated_at
         FROM agent_chat_session
        WHERE workspace_key = ? AND session_id = ?
        LIMIT 1`,
      [workspaceKey(workspace), sessionId],
    );
    const row = rows[0];
    if (!row) return undefined;
    const contextUsage = parseJson<ContextUsage | undefined>(row.context_usage_json, undefined);
    return {
      summary: summaryFromRow(row),
      workspace: row.workspace,
      sessionPath: row.session_path || undefined,
      sessionJsonl: row.session_jsonl || undefined,
      rawMessages: parseJson<unknown[]>(row.transcript_json, []),
      model: row.model_provider && row.model_id ? { provider: row.model_provider, id: row.model_id } : undefined,
      thinkingLevel: row.thinking_level || "medium",
      contextUsage,
    };
  }

  async save(record: PersistedSessionRecord): Promise<void> {
    const createdAt = new Date(record.summary.createdAt || record.summary.updatedAt);
    const updatedAt = new Date(record.summary.updatedAt);
    const transcript = JSON.stringify(record.rawMessages);
    const contextUsage = record.contextUsage ? JSON.stringify(record.contextUsage) : null;
    await this.pool.execute<ResultSetHeader>(
      `INSERT INTO agent_chat_session
        (session_id, workspace_key, workspace, title, session_path, session_jsonl,
         model_provider, model_id, thinking_level, transcript_json, context_usage_json,
         message_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         workspace_key = VALUES(workspace_key),
         workspace = VALUES(workspace),
         title = VALUES(title),
         session_path = VALUES(session_path),
         session_jsonl = VALUES(session_jsonl),
         model_provider = VALUES(model_provider),
         model_id = VALUES(model_id),
         thinking_level = VALUES(thinking_level),
         transcript_json = VALUES(transcript_json),
         context_usage_json = VALUES(context_usage_json),
         message_count = VALUES(message_count),
         updated_at = VALUES(updated_at)`,
      [
        record.summary.id,
        workspaceKey(record.workspace),
        record.workspace,
        record.summary.title || "新对话",
        record.sessionPath || null,
        record.sessionJsonl || null,
        record.model?.provider || null,
        record.model?.id || null,
        record.thinkingLevel,
        transcript,
        contextUsage,
        record.summary.messageCount ?? record.rawMessages.length,
        Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
        Number.isNaN(updatedAt.getTime()) ? new Date() : updatedAt,
      ],
    );
  }

  async delete(workspace: string, sessionId: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "DELETE FROM agent_chat_session WHERE workspace_key = ? AND session_id = ?",
      [workspaceKey(workspace), sessionId],
    );
    return result.affectedRows > 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

