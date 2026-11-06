import { AsyncLocalStorage } from "node:async_hooks";

export interface ReportExecution { runId: string; leaseToken: string; signal?: AbortSignal }
const executions = new AsyncLocalStorage<ReportExecution>();
export const currentReportExecution = () => executions.getStore();
export function runWithReportExecution<T>(execution: ReportExecution, run: () => T): T { return executions.run(execution, run); }

export const REPORT_READ_TOOLS = new Set(["stock_search", "stock_quote", "stock_kline", "stock_analyze",
  "stock_watchlist_list", "stock_position_list", "stock_screen", "stock_screen_detail", "web_search"]);
export const REPORT_READ_PROFILES = new Set(["stock-analyst", "stock-portfolio", "stock-screener", "web-researcher"]);

/** Credentials and leases live only in the server call chain, never in model arguments or transcripts. */
export async function requestReportWorker(action: "claim" | "authorize" | "data" | "finish", body: Record<string, unknown> = {}, signal?: AbortSignal): Promise<unknown> {
  const key = process.env.AGENT_REPORT_WORKER_KEY?.trim();
  if (!key || key.length < 32) throw new Error("定时报告执行器未配置，请管理员配置 AGENT_REPORT_WORKER_KEY（至少32字符）。");
  const url = new URL(process.env.STOCK_API_BASE_URL || "http://127.0.0.1:8080");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("若依后端地址无效。");
  const timeout = AbortSignal.timeout(action === "data" ? 150_000 : 15_000);
  const response = await fetch(`${url.toString().replace(/\/$/, "")}/agent/report-worker/${action}`, {
    method: "POST", redirect: "error", headers: { "Content-Type": "application/json", "X-Report-Worker-Key": key },
    body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }).catch(() => { throw new Error("无法连接报告执行服务或请求已取消。"); });
  if (!response.ok) throw new Error(`报告执行服务失败（HTTP ${response.status}），请检查执行器配置。`);
  const result = await response.json() as { code?: number; data?: unknown; msg?: string };
  if (result.code !== 200) throw new Error(result.msg || "报告执行服务返回错误。");
  return result.data;
}
