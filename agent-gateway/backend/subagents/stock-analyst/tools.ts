import { AsyncLocalStorage } from "node:async_hooks";
import { defineTool, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { authenticateWorkbench } from "../../src/lib/workbench-auth.js";

// 按 prompt 的异步调用链隔离身份，不能放到共享资源或持久化的模型上下文中。
const stockToolIdentity = new AsyncLocalStorage<{ token?: string }>();

export function runWithStockToolToken<T>(token: string | undefined, run: () => T): T {
  return stockToolIdentity.run({ token }, run);
}

/** Local screening results still require a live, authorized workbench identity. */
export async function authorizeStockScreen(signal?: AbortSignal): Promise<void> {
  const token = stockToolIdentity.getStore()?.token;
  if (!token) throw new Error("股票工具需要工作台登录身份，请登录工作台后重新发送消息。");
  await authenticateWorkbench(token, { signal, requiredPermission: "stock:analyzer:analyze" });
}

function normalizeStockCode(value: string): string {
  const code = value.trim().toLowerCase();
  if (/^(sh|sz)\d{6}$/.test(code)) return code;
  if (/^[01356]\d{5}$/.test(code)) return `${/^[56]/.test(code) ? "sh" : "sz"}${code}`;
  throw new Error("仅支持沪深 A 股和场内 ETF，请提供六位代码或 sh/sz 前缀代码；指数请明确市场，例如 sh000001。");
}

interface StockResponse {
  code: number;
  msg?: string;
  data?: unknown;
}

interface StockSearchMatch {
  code: string;
  name: string;
  market: string;
  securityType: string;
  exactMatch: boolean;
}

export async function requestStockApi(path: string, signal?: AbortSignal, body?: Record<string, string>): Promise<unknown> {
  const token = stockToolIdentity.getStore()?.token;
  if (!token) throw new Error("股票工具需要工作台登录身份，请登录工作台后重新发送消息。");
  const baseUrl = new URL(process.env.STOCK_API_BASE_URL || "http://127.0.0.1:8080");
  if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error("STOCK_API_BASE_URL 必须是无账号、查询参数或片段的 HTTP(S) 后端地址。");
  }
  // 保留可选 context-path；模型只能选择代码和条数，不能指定地址或认证信息。
  const url = `${baseUrl.toString().replace(/\/$/, "")}${path}`;
  const timeout = AbortSignal.timeout(150_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "error",
      signal: requestSignal,
    });
  } catch {
    if (signal?.aborted) throw new Error("股票查询已取消。");
    if (timeout.aborted) throw new Error("股票查询超时，请稍后重试。");
    throw new Error("无法连接股票服务，请检查 STOCK_API_BASE_URL 和若依后端运行状态。");
  }
  if (response.status === 401) throw new Error("工作台登录已失效，请重新登录后发送消息。");
  if (response.status === 403) throw new Error("当前账号没有股票分析权限（stock:analyzer:analyze）。");
  if (!response.ok) throw new Error(`股票服务请求失败（HTTP ${response.status}）。`);
  let result: StockResponse;
  try { result = await response.json() as StockResponse; }
  catch { throw new Error("股票服务未返回有效 JSON，请检查后端地址是否指向若依 API。"); }
  if (!result || result.code !== 200) {
    if (result?.code === 401) throw new Error("工作台登录已失效，请重新登录后发送消息。");
    if (result?.code === 403) throw new Error("当前账号没有股票分析权限（stock:analyzer:analyze）。");
    throw new Error(result?.msg || "股票服务返回错误。");
  }
  if (result.data == null) throw new Error("股票服务未返回数据，不能据此作出分析结论。");
  return result.data;
}

function toolResult(stockCode: string, source: string, data: unknown) {
  const payload = { stockCode, source, fetchedAt: new Date().toISOString(), data };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    details: { stockCode, source },
  };
}

const stockCodeParameter = Type.String({ minLength: 6, maxLength: 8, description: "沪深股票/ETF代码，例如600519、sz000001；指数必须带市场前缀，例如sh000001。只有名称时先调用stock_search，不能猜测代码。" });

export function createStockToolsExtension(): ExtensionFactory {
  return (pi) => {
    pi.registerTool(defineTool({
      name: "stock_search",
      label: "股票名称检索",
      description: "按名称、简称或代码搜索沪深股票、场内ETF和指数。返回名称、带市场前缀的代码及类型；唯一精确匹配时给出resolvedStockCode，其他情况展示候选请用户确认。",
      promptSnippet: "将股票名称解析为代码，例如用户说“分析西藏珠峰”时先检索名称",
      promptGuidelines: ["用户只给股票名称时先调用 stock_search。仅 resolvedStockCode 非空时可直接继续行情/分析；模糊或多个匹配先展示候选让用户选择，不根据记忆猜代码。"],
      executionMode: "parallel",
      parameters: Type.Object({ keyword: Type.String({ minLength: 1, maxLength: 40, description: "用户提供的股票名称、简称或代码，例如西藏珠峰。" }) }),
      execute: async (_id, params, signal) => {
        const keyword = params.keyword.trim();
        if (!keyword) throw new Error("请输入要搜索的股票名称或代码。");
        const data = await requestStockApi(`/stock/analyzer/search?keyword=${encodeURIComponent(keyword)}`, signal);
        if (!Array.isArray(data) || !data.every((item) => item && typeof item === "object"
          && typeof item.code === "string" && /^(sh|sz)\d{6}$/.test(item.code)
          && typeof item.name === "string" && typeof item.exactMatch === "boolean")) {
          throw new Error("股票搜索结果格式无效。");
        }
        const matches = data as StockSearchMatch[];
        const exactMatches = matches.filter((item) => item.exactMatch);
        const resolvedStockCode = exactMatches.length === 1 ? exactMatches[0].code : null;
        const source = "腾讯证券名称搜索";
        const payload = {
          keyword, source, fetchedAt: new Date().toISOString(),
          data: { matches, resolvedStockCode, requiresSelection: matches.length > 0 && !resolvedStockCode },
        };
        return {
          content: [{ type: "text", text: JSON.stringify(payload) }],
          details: { keyword, source },
        };
      },
    }));
    pi.registerTool(defineTool({
      name: "stock_quote",
      label: "股票实时行情",
      description: "查询单只沪深股票、场内ETF或带市场前缀指数的最新报价、涨跌幅、成交量额和行情时间；不计算均线。停盘期间返回最近报价。",
      promptSnippet: "查询沪深股票或 ETF 的最新行情",
      promptGuidelines: ["行情回答注明来源及行情时间，fetchedAt 只是查询时间；520 战法分析遵循系统提示中已加载的 stock-520 技能，不调用文件读取工具。"],
      executionMode: "parallel",
      parameters: Type.Object({ stockCode: stockCodeParameter }),
      execute: async (_id, params, signal) => {
        const code = normalizeStockCode(params.stockCode);
        return toolResult(code, "腾讯行情", await requestStockApi(`/stock/analyzer/quote/${code}`, signal));
      },
    }));
    pi.registerTool(defineTool({
      name: "stock_kline",
      label: "日K线与均线",
      description: "查询最近1至60根日K线，包含日期、OHLC、成交量及MA5/MA10/MA20。先按完整历史计算均线再截取，实际条数可能少于请求；盘中最后一根可能未收盘。",
      promptSnippet: "查询日 K 线及 MA5、MA10、MA20 均线",
      executionMode: "parallel",
      parameters: Type.Object({ stockCode: stockCodeParameter, limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 60, default: 30, description: "最近交易日条数，默认30，最多60。" })) }),
      execute: async (_id, params, signal) => {
        const code = normalizeStockCode(params.stockCode);
        return toolResult(code, "新浪日K线；均线由工作台计算", await requestStockApi(`/stock/analyzer/kline/${code}?limit=${params.limit ?? 30}`, signal));
      },
    }));
    pi.registerTool(defineTool({
      name: "stock_analyze",
      label: "股票规则分析",
      description: "复用工作台520规则引擎，返回行情、均线指标、strategyReport三步规则及证据，不调用DeepSeek。用于stock-520 Skill；不读取自选或持仓。",
      promptSnippet: "获取股票 520 战法结构化规则报告，供 stock-520 技能解读",
      executionMode: "parallel",
      parameters: Type.Object({ stockCode: stockCodeParameter }),
      execute: async (_id, params, signal) => {
        const code = normalizeStockCode(params.stockCode);
        const data = await requestStockApi("/stock/analyzer/analyze", signal, { stockCode: code, includeAi: "false" });
        // 原接口的 riskLevel 默认值不代表规则评估，避免将其误作本次风险结论。
        if (data && typeof data === "object" && !Array.isArray(data)) {
          const { aiAdvice: _advice, aiReason: _reason, riskLevel: _risk, ...rules } = data as Record<string, unknown>;
          return toolResult(code, "腾讯行情、新浪日K线；工作台520规则引擎", rules);
        }
        throw new Error("股票分析结果格式无效。");
      },
    }));
  };
}
