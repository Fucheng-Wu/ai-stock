export interface WorkbenchIdentity {
  userId: string;
  token: string;
  authorizedUntil: number;
  canManage: boolean;
}

export class WorkbenchServiceError extends Error {}

const managementCommands = new Set([
  "get_models_config", "save_models_config", "discover_provider_models", "test_model_config",
  "provider_login", "auth_response", "auth_cancel", "get_feature_settings", "create_skill",
  "set_skill_enabled", "plugin_action", "set_plugin_enabled", "set_subagent_settings",
  "set_subagent_profile_enabled", "create_subagent_profile", "delete_subagent_profile", "save_mcp_config",
]);

export function requireCommandPermission(identity: WorkbenchIdentity, command: string): void {
  if (managementCommands.has(command) && !identity.canManage) {
    throw new Error("此操作需要 Agent 管理权限（agent:chat:manage）。");
  }
}

export class WorkbenchAuthError extends Error {
  constructor(message: string, readonly code: "AUTH_REQUIRED" | "FORBIDDEN" = "AUTH_REQUIRED") {
    super(message);
  }
}

/** Resolve identity from the trusted RuoYi service, never from a client-supplied user ID. */
export async function authenticateWorkbench(token: unknown): Promise<WorkbenchIdentity> {
  if (typeof token !== "string" || !token.trim() || token.length > 8192 || /\s/.test(token)) {
    throw new WorkbenchAuthError("请登录工作台后连接 Agent 助手。");
  }
  const baseUrl = new URL(process.env.STOCK_API_BASE_URL || "http://127.0.0.1:8080");
  if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error("STOCK_API_BASE_URL 必须是有效的若依后端 HTTP(S) 地址。");
  }
  let response: Response;
  try {
    response = await fetch(`${baseUrl.toString().replace(/\/$/, "")}/getInfo`, {
      headers: { Authorization: `Bearer ${token}` },
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new WorkbenchServiceError("工作台服务暂不可用，正在等待重新连接，草稿已保留。");
  }
  if (response.status === 401) throw new WorkbenchAuthError("工作台登录已失效，请重新登录。");
  if (response.status === 403) throw new WorkbenchAuthError("当前账号无权访问 Agent 助手。", "FORBIDDEN");
  if (!response.ok) throw new WorkbenchServiceError("工作台服务暂不可用，请稍后重试。");
  const result = await response.json().catch(() => undefined) as {
    code?: number; user?: { userId?: unknown }; permissions?: unknown;
  } | undefined;
  if (result?.code === 401) throw new WorkbenchAuthError("工作台登录已失效，请重新登录。");
  if (result?.code === 403) throw new WorkbenchAuthError("当前账号无权访问 Agent 助手。", "FORBIDDEN");
  if (result?.code !== 200) throw new WorkbenchServiceError("工作台身份服务暂不可用，请稍后重试。");
  const id = result.user?.userId;
  if (!(typeof id === "string" && /^[1-9]\d*$/.test(id))
      && !(typeof id === "number" && Number.isSafeInteger(id) && id > 0)) {
    throw new WorkbenchAuthError("工作台未返回有效的用户身份。");
  }
  if (!Array.isArray(result.permissions)
      || !result.permissions.some((permission) => permission === "*:*:*" || permission === "agent:chat:use")) {
    throw new WorkbenchAuthError("当前账号没有 Agent 助手权限（agent:chat:use）。", "FORBIDDEN");
  }
  const canManage = result.permissions.some((permission) => permission === "*:*:*" || permission === "agent:chat:manage");
  return { userId: String(id), token, canManage, authorizedUntil: Date.now() + 60_000 };
}
