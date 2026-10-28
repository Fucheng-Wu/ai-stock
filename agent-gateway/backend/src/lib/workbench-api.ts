import { AsyncLocalStorage } from "node:async_hooks";
import { authenticateWorkbench } from "./workbench-auth.js";

// 身份仅存在于本轮异步调用链；所有业务子代理共享此上下文，不进入模型或历史。
const toolIdentity = new AsyncLocalStorage<{ token?: string }>();

export function runWithWorkbenchToolToken<T>(token: string | undefined, run: () => T): T {
  return toolIdentity.run({ token }, run);
}

function currentToken(): string {
  const token = toolIdentity.getStore()?.token;
  if (!token) throw new Error("业务工具需要工作台登录身份，请登录工作台后重新发送消息。");
  return token;
}

export async function authorizeWorkbenchTool(requiredPermission: string, signal?: AbortSignal): Promise<void> {
  await authenticateWorkbench(currentToken(), { signal, requiredPermission });
}

interface WorkbenchResponse { code?: number; msg?: string; data?: unknown }
interface RequestOptions {
  requiredPermission: string;
  serviceName?: string;
  permissionName?: string;
  mutation?: boolean;
  verificationTarget?: string;
}

/** Server-selected paths only; model tool schemas never accept URLs, credentials or user IDs. */
export async function requestWorkbenchApi(
  path: string, signal: AbortSignal | undefined, body: Record<string, unknown> | undefined,
  options: RequestOptions,
): Promise<unknown> {
  const token = currentToken();
  signal?.throwIfAborted();
  const service = options.serviceName || "工作台";
  const forbidden = `当前账号没有${options.permissionName || "此操作"}权限（${options.requiredPermission}）。`;
  const uncertain = `新增结果尚未确认，请先在${options.verificationTarget || "对应菜单"}核实是否已添加，再决定是否重试。`;
  const baseUrl = new URL(process.env.STOCK_API_BASE_URL || "http://127.0.0.1:8080");
  if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error("STOCK_API_BASE_URL 必须是无账号、查询参数或片段的 HTTP(S) 后端地址。");
  }
  // 保留若依 context-path，禁止把相对路径解析成另一个主机或上级路径。
  if (!path.startsWith("/") || path.startsWith("//") || path.split("?")[0].split("/").includes("..")) {
    throw new Error("业务接口路径无效。");
  }
  const timeout = AbortSignal.timeout(150_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(`${baseUrl.toString().replace(/\/$/, "")}${path}`, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: requestSignal,
    });
  } catch {
    if (options.mutation) throw new Error(uncertain);
    if (signal?.aborted) throw new Error(`${service}查询已取消。`);
    if (timeout.aborted) throw new Error(`${service}查询超时，请稍后重试。`);
    throw new Error(`无法连接${service}服务，请检查 STOCK_API_BASE_URL 和若依后端运行状态。`);
  }
  if (response.status === 401) throw new Error("工作台登录已失效，请重新登录后发送消息。");
  if (response.status === 403) throw new Error(forbidden);
  if (!response.ok) throw new Error(`${service}服务请求失败（HTTP ${response.status}）。${options.mutation ? uncertain : ""}`);
  let result: WorkbenchResponse;
  try { result = await response.json() as WorkbenchResponse; }
  catch { throw new Error(options.mutation ? uncertain : `${service}服务未返回有效 JSON，请检查后端地址是否指向若依 API。`); }
  if (!result || typeof result !== "object" || Array.isArray(result) || typeof result.code !== "number") {
    throw new Error(options.mutation ? uncertain : `${service}服务返回格式无效。`);
  }
  if (result.code === 401) throw new Error("工作台登录已失效，请重新登录后发送消息。");
  if (result.code === 403) throw new Error(forbidden);
  if (result.code !== 200) throw new Error(typeof result.msg === "string" && result.msg ? result.msg : `${service}服务返回错误。`);
  // 若依新增接口成功时只有 code/msg，没有 data，必须按业务状态确认。
  if (options.mutation) return { success: true };
  if (result.data == null) throw new Error(`${service}服务未返回数据，不能据此作出结论。`);
  return result.data;
}
