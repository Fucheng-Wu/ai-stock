import { requestStockApi } from "../../subagents/stock-analyst/tools.js";
import type { ScreenQuery, ScreenSelection } from "./stock-screen-store.js";

export interface StockScreenReader {
  query(query?: ScreenQuery, signal?: AbortSignal): Promise<unknown>;
  detail(stockCode: string, selection?: ScreenSelection, signal?: AbortSignal): Promise<unknown>;
}

/** The RuoYi API enforces stock permission and reads MySQL; never fall back to stale local files. */
export class StockScreenApi implements StockScreenReader {
  async query(query: ScreenQuery = {}, signal?: AbortSignal): Promise<unknown> {
    return this.request("/results", query, signal);
  }
  async detail(stockCode: string, selection: ScreenSelection = {}, signal?: AbortSignal): Promise<unknown> {
    return this.request("/detail", { ...selection, stockCode }, signal);
  }
  private async request(path: string, parameters: object, signal?: AbortSignal) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(parameters)) if (value !== undefined) search.set(key, String(value));
    const result = await requestStockApi(`/stock/screener${path}?${search}`, signal);
    if (!result || typeof result !== "object" || Array.isArray(result)
        || typeof (result as Record<string, unknown>).snapshotId !== "string"
        || typeof (result as Record<string, unknown>).tradeDate !== "string") throw new Error("MySQL筛选服务未返回有效快照信息。");
    return result;
  }
}
