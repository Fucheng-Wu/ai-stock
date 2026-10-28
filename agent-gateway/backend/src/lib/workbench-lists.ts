import { Type } from "typebox";
import { authorizeWorkbenchTool, requestWorkbenchApi } from "./workbench-api.js";

export const workbenchListParameters = {
  page: Type.Optional(Type.Integer({ minimum: 1, maximum: 1_000_000, default: 1, description: "页码，从1开始；继续查看时使用下一页。" })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20, description: "每页条数，最多100条。" })),
  keyword: Type.Optional(Type.String({ maxLength: 100, description: "可选关键词；股票按名称或代码匹配，待办按内容匹配。" })),
};

interface ListParams { page?: number; pageSize?: number; keyword?: string }
interface ListOptions {
  path: string;
  permission: string;
  serviceName: string;
  fields: readonly string[];
  requiredFields: readonly string[];
  keywordFields: readonly string[];
  filter?: (row: Record<string, unknown>) => boolean;
}

/** Fixed business endpoints return the current user's rows; never send model-provided user IDs or paths. */
export async function queryWorkbenchList(options: ListOptions, params: ListParams, signal?: AbortSignal) {
  const page = params.page ?? 1, pageSize = params.pageSize ?? 20;
  if (!Number.isInteger(page) || page < 1 || page > 1_000_000) throw new Error("页码必须为1到1000000的整数。");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error("每页条数必须为1到100的整数。");
  if (params.keyword !== undefined && (typeof params.keyword !== "string" || params.keyword.length > 100)) throw new Error("查询关键词必须是最多100字符的字符串。");
  const keyword = (params.keyword ?? "").trim();
  await authorizeWorkbenchTool(options.permission, signal);
  const data = await requestWorkbenchApi(options.path, signal, undefined, {
    requiredPermission: options.permission, serviceName: options.serviceName,
  });
  if (!Array.isArray(data) || !data.every(row => row && typeof row === "object" && !Array.isArray(row)
    && options.requiredFields.every(field => row[field] !== undefined && row[field] !== null))) {
    throw new Error(`${options.serviceName}列表格式无效，不能据此判断清单为空。`);
  }
  const matched = (data as Record<string, unknown>[]).filter(row => (!options.filter || options.filter(row))
    && (!keyword || options.keywordFields.some(field => String(row[field] ?? "").toLowerCase().includes(keyword.toLowerCase()))));
  const start = (page - 1) * pageSize;
  const items = matched.slice(start, start + pageSize).map(row => Object.fromEntries(options.fields
    .filter(field => Object.hasOwn(row, field)).map(field => [field, row[field]])));
  return { source: `工作台${options.serviceName}清单`, fetchedAt: new Date().toISOString(),
    totalRecords: data.length, total: matched.length, page, pageSize, hasMore: start + items.length < matched.length, keyword, items };
}
