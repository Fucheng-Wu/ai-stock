import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import mysql, { type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import type { ContextUsage, SessionSummary, SessionPage, ThinkingLevel } from "../../../shared/types.js";
import type { PersistedSessionRecord } from "./types.js";

interface SessionRow extends RowDataPacket {
  session_id: string;
  user_id: string | null;
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
          user_id varchar(64) DEFAULT NULL COMMENT '若依用户ID；NULL为未归属的旧会话',
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
          KEY idx_agent_chat_workspace_updated (workspace_key, updated_at),
          KEY idx_agent_chat_user_updated (workspace_key, user_id, updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Agent会话持久化'
      `);
    }
    const [columns] = await this.pool.query<RowDataPacket[]>("SHOW COLUMNS FROM agent_chat_session LIKE 'user_id'");
    if (!columns.length) {
      try {
        // Legacy records intentionally stay NULL: their owner cannot be inferred safely.
        await this.pool.execute(`ALTER TABLE agent_chat_session
          ADD COLUMN user_id varchar(64) DEFAULT NULL COMMENT '若依用户ID；NULL为未归属的旧会话',
          ADD KEY idx_agent_chat_user_updated (workspace_key, user_id, updated_at)`);
      } catch {
        throw new Error("会话表需要用户隔离迁移，请由数据库管理员执行 sql/agent_chat_user_isolation.sql 后重启网关。");
      }
    }
  }

  async list(workspace: string, userId: string, query = "", cursor?: string): Promise<SessionPage> {
    const conditions = ["workspace_key = ?", "user_id = ?"];
    const values: string[] = [workspaceKey(workspace), userId];
    if (query) {
      conditions.push("title LIKE ? ESCAPE '!'");
      values.push(`%${query.replace(/[!%_]/g, (character) => `!${character}`)}%`);
    }
    if (cursor) {
      let decoded: unknown;
      try { decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); }
      catch { throw new Error("会话分页游标无效，请刷新列表。"); }
      if (!Array.isArray(decoded) || decoded.length !== 2 || typeof decoded[0] !== "string"
          || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/.test(decoded[0])
          || typeof decoded[1] !== "string" || decoded[1].length > 128) throw new Error("会话分页游标无效");
      conditions.push("(updated_at < ? OR (updated_at = ? AND session_id < ?))");
      values.push(decoded[0], decoded[0], decoded[1]);
    }
    const [rows] = await this.pool.execute<SessionRow[]>(
      `SELECT session_id, user_id, workspace, title, session_path, NULL AS session_jsonl,
              model_provider, model_id, thinking_level, '[]' AS transcript_json,
              context_usage_json, message_count, created_at, updated_at
         FROM agent_chat_session
        WHERE ${conditions.join(" AND ")}
        ORDER BY updated_at DESC, session_id DESC LIMIT 31`,
      values,
    );
    const page = rows.slice(0, 30);
    const last = page.at(-1);
    return {
      sessions: page.map(summaryFromRow),
      nextCursor: rows.length > 30 && last
        ? Buffer.from(JSON.stringify([toIso(last.updated_at).replace("T", " ").replace(/Z$/, ""), last.session_id])).toString("base64url")
        : undefined,
    };
  }

  async get(workspace: string, userId: string, sessionId: string, includeJsonl = true): Promise<PersistedSessionRecord | undefined> {
    const [rows] = await this.pool.execute<SessionRow[]>(
      `SELECT session_id, user_id, workspace, title, session_path, ${includeJsonl ? "session_jsonl" : "NULL AS session_jsonl"},
              model_provider, model_id, thinking_level, transcript_json,
              context_usage_json, message_count, created_at, updated_at
         FROM agent_chat_session
        WHERE workspace_key = ? AND user_id = ? AND session_id = ?
        LIMIT 1`,
      [workspaceKey(workspace), userId, sessionId],
    );
    const row = rows[0];
    if (!row) return undefined;
    const contextUsage = parseJson<ContextUsage | undefined>(row.context_usage_json, undefined);
    return {
      userId,
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
    if (!/^[1-9]\d*$/.test(record.userId)) throw new Error("不能保存没有所属用户的会话");
    const createdAt = new Date(record.summary.createdAt || record.summary.updatedAt);
    const updatedAt = new Date(record.summary.updatedAt);
    const transcript = JSON.stringify(record.rawMessages);
    const contextUsage = record.contextUsage ? JSON.stringify(record.contextUsage) : null;
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [owners] = await connection.execute<RowDataPacket[]>(
        "SELECT user_id, workspace_key FROM agent_chat_session WHERE session_id = ? FOR UPDATE",
        [record.summary.id],
      );
      if (owners[0] && (owners[0].user_id !== record.userId || owners[0].workspace_key !== workspaceKey(record.workspace))) {
        throw new Error("不能覆盖其他用户或未归属的会话");
      }
      await connection.execute<ResultSetHeader>(
      `INSERT INTO agent_chat_session
        (session_id, user_id, workspace_key, workspace, title, session_path, session_jsonl,
         model_provider, model_id, thinking_level, transcript_json, context_usage_json,
         message_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        record.userId,
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
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async delete(workspace: string, userId: string, sessionId: string): Promise<boolean> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "DELETE FROM agent_chat_session WHERE workspace_key = ? AND user_id = ? AND session_id = ?",
      [workspaceKey(workspace), userId, sessionId],
    );
    return result.affectedRows > 0;
  }

  async rename(workspace: string, userId: string, sessionId: string, title: string): Promise<void> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      "UPDATE agent_chat_session SET title = ? WHERE workspace_key = ? AND user_id = ? AND session_id = ?",
      [title, workspaceKey(workspace), userId, sessionId],
    );
    if (!result.affectedRows) throw new Error("会话不存在或无权访问");
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

