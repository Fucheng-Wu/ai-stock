import { defineTool, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StockScreenApi, type StockScreenReader } from "../../src/lib/stock-screen-api.js";
import { authorizeStockScreen } from "../stock-analyst/tools.js";

const selection = {
  snapshotId: Type.Optional(Type.String({ minLength: 1, maxLength: 120, description: "前次查询返回的快照ID，分页和详情应保持同一ID。" })),
  tradeDate: Type.Optional(Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "用户明确要求的行情日期YYYY-MM-DD；没有该日快照时报告缺失，不回退冒充。" })),
};
function result(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ fetchedAt: new Date().toISOString(), data }) }],
    details: { source: "工作台520全市场筛选快照" } };
}

export function createStockScreenToolsExtension(store: StockScreenReader = new StockScreenApi()): ExtensionFactory {
  return (pi) => {
    pi.registerTool(defineTool({
      name: "stock_screen", label: "520全市场选股",
      description: "查询已完成的沪深北A股520日线筛选候选，返回行情日期、快照ID、覆盖率与分页结果；不是实时行情，不重新运行筛选。支持买点、交易所、ST和代码/名称过滤，按代码排序。",
      promptSnippet: "查找全市场符合520买点的股票，保留快照日期和ID",
      promptGuidelines: ["分页、后续详情传原snapshotId；区分过滤后total与全市场coverage，fetchedAt只是查询时间。", "零结果不代表同步或权限失败；有错误必须如实报告，不能编造实时买点或胜率。"],
      executionMode: "parallel",
      parameters: Type.Object({ ...selection,
        signal: Type.Optional(Type.Union([Type.Literal("ALL"), Type.Literal("GOLDEN_CROSS"), Type.Literal("RETRACE"), Type.Literal("CONVERGENCE")], { description: "全部、金叉、缩量回踩、粘合发散；默认ALL。" })),
        exchange: Type.Optional(Type.Union([Type.Literal("ALL"), Type.Literal("sh"), Type.Literal("sz"), Type.Literal("bj")], { description: "默认沪深北全部。" })),
        keyword: Type.Optional(Type.String({ minLength: 1, maxLength: 40, description: "候选中的名称或代码；不搜索未命中的全市场股票名称。" })),
        excludeST: Type.Optional(Type.Boolean({ description: "默认false，保留并标记ST；用户明确排除时设true。" })),
        page: Type.Optional(Type.Integer({ minimum: 1, maximum: 10000, default: 1 })),
        pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 10 })),
      }, { additionalProperties: false }),
      execute: async (_id, params, signal) => {
        await authorizeStockScreen(signal);
        return result(await store.query(params, signal));
      },
    }));
    pi.registerTool(defineTool({
      name: "stock_screen_detail", label: "520选股规则详情",
      description: "查询同一筛选快照中指定A股的原始Java规则证据，含未命中或被排除的股票。支持沪深北六位或市场前缀代码，不取实时数据。",
      promptSnippet: "查看某只股票为何命中、未命中或被排除",
      promptGuidelines: ["沿用列表的snapshotId；名称需要先由候选查询唯一精确解析，不猜代码。", "found=false或被排除不等于没有买点；解释trendStep与三个买点子项的证据。"],
      executionMode: "parallel",
      parameters: Type.Object({ ...selection,
        stockCode: Type.String({ pattern: "^(?:(?:sh|sz|bj))?\\d{6}$", minLength: 6, maxLength: 8, description: "明确的A股代码，例如600519、sz000001、bj920000。" }),
      }, { additionalProperties: false }),
      execute: async (_id, params, signal) => {
        await authorizeStockScreen(signal);
        return result(await store.detail(params.stockCode, params, signal));
      },
    }));
  };
}
