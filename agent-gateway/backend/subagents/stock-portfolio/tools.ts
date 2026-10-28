import { defineTool, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { authorizeStockPermission, createStockToolsExtension, normalizeStockCode, requestStockApi } from "../stock-analyst/tools.js";
import { queryWorkbenchList, workbenchListParameters } from "../../src/lib/workbench-lists.js";

const stockCode = Type.String({ minLength: 6, maxLength: 8, description: "用户明确指定或 stock_search 唯一精确匹配的沪深股票/ETF代码，例如 sh600519。不能猜测代码。" });
const costPattern = "^(?:0|[1-9][0-9]{0,13})(?:\\.[0-9]{1,2})?$";

function result(target: "watchlist" | "position", data: Record<string, unknown>) {
  const payload = { success: true, target, ...data };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], details: payload };
}

export function createStockPortfolioToolsExtension(): ExtensionFactory {
  return async (pi) => {
    // 只复用名称检索，不向记录角色开放行情、规则分析或其他工具。
    await createStockToolsExtension(true)(pi);
    pi.registerTool(defineTool({
      name: "stock_watchlist_add",
      label: "添加自选股票",
      description: "将用户明确要求添加的单只沪深股票或场内ETF写入当前登录用户的我的自选。已存在时报错，不删除、不修改。仅在接口确认成功后报告已添加；失败或结果未知时不得自动重试。",
      promptSnippet: "把用户指定的股票添加到股票管理菜单中的我的自选",
      executionMode: "sequential",
      parameters: Type.Object({ stockCode }, { additionalProperties: false }),
      execute: async (_id, params, signal) => {
        const code = normalizeStockCode(params.stockCode);
        await authorizeStockPermission("stock:watchlist:add", signal);
        await requestStockApi("/stock/watchlist", signal, { stockCode: code }, {
          requiredPermission: "stock:watchlist:add", mutation: true,
        });
        return result("watchlist", { stockCode: code });
      },
    }));
    pi.registerTool(defineTool({
      name: "stock_position_add",
      label: "添加持仓记录",
      description: "将用户提供的股票、每股成本价及持仓股数记录到当前用户的我的持仓。这是持仓记账，不是证券买入或下单。成本价和数量必须由用户明确提供，不能使用现价或默认值。缺失时先询问用户；已存在时不覆盖、不加仓；失败或结果未知时不得自动重试。",
      promptSnippet: "根据用户明确提供的成本价和股数新增一条持仓记录",
      executionMode: "sequential",
      parameters: Type.Object({
        stockCode,
        costPrice: Type.String({ pattern: costPattern, maxLength: 17, description: "用户提供的每股成本价，十进制字符串，大于0，最多两位小数，例如12.30；超出精度先请用户明确，不擅自四舍五入。" }),
        quantity: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER, description: "用户明确提供的持仓股数，正整数；用户说手时按1手=100股换算并在结果中说明。" }),
      }, { additionalProperties: false }),
      execute: async (_id, params, signal) => {
        const code = normalizeStockCode(params.stockCode);
        if (typeof params.costPrice !== "string" || !new RegExp(costPattern).test(params.costPrice) || Number(params.costPrice) <= 0) {
          throw new Error("请提供大于0且最多两位小数的每股成本价，不能使用默认成本价。");
        }
        if (!Number.isSafeInteger(params.quantity) || params.quantity <= 0) {
          throw new Error("请提供有效的持仓股数（正整数），不能使用默认数量。");
        }
        await authorizeStockPermission("stock:position:add", signal);
        await requestStockApi("/stock/position", signal, {
          stockCode: code, costPrice: params.costPrice, quantity: params.quantity,
        }, { requiredPermission: "stock:position:add", mutation: true });
        return result("position", { stockCode: code, costPrice: params.costPrice, quantity: params.quantity });
      },
    }));
    for (const target of ["watchlist", "position"] as const) {
      const isPosition = target === "position";
      const title = isPosition ? "我的持仓" : "我的自选";
      pi.registerTool(defineTool({
        name: `stock_${target}_list`,
        label: `查看${title}`,
        description: `查询当前登录用户的${title}，按股票名称或代码筛选并分页。仅查询已保存记录，不代表实时行情；持仓成本和数量以记录为准，不推算实时盈亏。无需新增或股票分析权限。`,
        promptSnippet: `查看当前用户的${title}`,
        executionMode: "parallel",
        parameters: Type.Object(workbenchListParameters, { additionalProperties: false }),
        execute: async (_id, params, signal) => result(target, { operation: "list", ...await queryWorkbenchList({
          path: `/stock/${target}/list`, permission: `stock:${target}:list`, serviceName: title,
          fields: isPosition ? ["positionId", "stockCode", "stockName", "market", "costPrice", "quantity", "createTime", "updateTime"]
            : ["watchlistId", "stockCode", "stockName", "createTime"],
          requiredFields: isPosition ? ["stockCode", "stockName", "costPrice", "quantity"] : ["stockCode", "stockName"],
          keywordFields: ["stockCode", "stockName"],
        }, params, signal) }),
      }));
    }
  };
}
