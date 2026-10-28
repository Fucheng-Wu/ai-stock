import { defineTool, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { authorizeWorkbenchTool, requestWorkbenchApi } from "../../src/lib/workbench-api.js";
import { queryWorkbenchList, workbenchListParameters } from "../../src/lib/workbench-lists.js";

// 与待办页面 CATEGORIES 保持一致；分类不是模型可任意创建的值。
const CATEGORIES = ["工作", "学习", "生活"] as const;

export function createTodoToolsExtension(): ExtensionFactory {
  return (pi) => {
    pi.registerTool(defineTool({
      name: "todo_add",
      label: "添加待办",
      description: "将用户明确要求记录的事项添加到当前登录用户的个人待办清单，初始状态为未完成。仅保存内容和工作/学习/生活分类，没有到期日、提醒或执行任务能力。信息明确即可添加，未指定分类可按内容归类，无法判断时默认工作；新增结果未知时不得自动重试。",
      promptSnippet: "把用户明确要求记录的事项添加到个人待办清单",
      executionMode: "sequential",
      parameters: Type.Object({
        content: Type.String({ minLength: 1, maxLength: 500, description: "用户提供的待办内容，保留原意和必要细节，最多500个字符，不擅自添加任务或截断。" }),
        category: Type.Optional(Type.Union(CATEGORIES.map(value => Type.Literal(value)), {
          default: "工作", description: "工作、学习或生活；优先使用用户指定分类，否则按内容归类，无法判断时默认工作。",
        })),
      }, { additionalProperties: false }),
      execute: async (_id, params, signal) => {
        const content = typeof params.content === "string" ? params.content.trim() : "";
        if (!content) throw new Error("待办内容不能为空，请提供要记录的事项。");
        if (content.length > 500) throw new Error("待办内容不能超过500个字符，请用户明确精简后再添加，不能自动截断。");
        const category = params.category === undefined ? "工作" : params.category;
        if (!CATEGORIES.includes(category)) throw new Error("待办分类仅支持工作、学习和生活。");
        await authorizeWorkbenchTool("todo:task:add", signal);
        await requestWorkbenchApi("/todo/task", signal, { content, category }, {
          requiredPermission: "todo:task:add", serviceName: "待办", mutation: true, verificationTarget: "个人待办清单",
        });
        const payload = { success: true, target: "todo", content, category, status: "0" };
        return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], details: payload };
      },
    }));
    pi.registerTool(defineTool({
      name: "todo_list",
      label: "查看待办清单",
      description: "查询当前登录用户的个人待办清单，支持分页、内容关键词、工作/学习/生活分类和完成状态筛选。未指定筛选时包含全部分类及完成状态；状态0为未完成、1为已完成。只读查询，无需新增或股票权限。",
      promptSnippet: "查看我的待办、未完成事项或指定分类清单",
      executionMode: "parallel",
      parameters: Type.Object({
        ...workbenchListParameters,
        category: Type.Optional(Type.Union(CATEGORIES.map(value => Type.Literal(value)), { description: "按工作、学习或生活筛选；不填则全部分类。" })),
        status: Type.Optional(Type.Union([Type.Literal("0"), Type.Literal("1")], { description: "0为未完成，1为已完成；不填则全部状态。" })),
      }, { additionalProperties: false }),
      execute: async (_id, params, signal) => {
        if (params.category !== undefined && !CATEGORIES.includes(params.category)) throw new Error("待办分类仅支持工作、学习和生活。");
        if (params.status !== undefined && !["0", "1"].includes(params.status)) throw new Error("待办状态仅支持0（未完成）或1（已完成）。");
        const data = await queryWorkbenchList({
          path: "/todo/task/list", permission: "todo:task:list", serviceName: "个人待办",
          fields: ["taskId", "content", "category", "status", "createTime", "updateTime"],
          requiredFields: ["content", "category", "status"], keywordFields: ["content"],
          filter: row => (params.category === undefined || row.category === params.category)
            && (params.status === undefined || row.status === params.status),
        }, params, signal);
        const payload = { success: true, operation: "list", target: "todo", ...data,
          category: params.category ?? null, status: params.status ?? null };
        return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], details: payload };
      },
    }));
  };
}
