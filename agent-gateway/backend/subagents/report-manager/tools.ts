import { defineTool, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { authorizeWorkbenchTool, requestWorkbenchApi } from "../../src/lib/workbench-api.js";

const id = Type.String({ pattern: "^[a-f0-9-]{36}$", description: "查询返回的任务或报告ID，禁止猜测。" });
const version = Type.Integer({ minimum: 1, description: "最近查询返回的version；冲突后重新查询。" });
const fields = {
  title: Type.String({ minLength: 1, maxLength: 100 }),
  prompt: Type.String({ minLength: 1, maxLength: 5000, description: "每次运行应完成的完整报告要求；保留本周/今日等相对执行日期要求，不写入凭证。" }),
  scheduleType: Type.Union([Type.Literal("once"), Type.Literal("daily"), Type.Literal("workday"), Type.Literal("holiday"), Type.Literal("workweek"), Type.Literal("custom"), Type.Literal("weekly")], {
    description: "once仅一次；daily每天；workday中国大陆法定工作日（含调休补班）；holiday节假日及周末（排除补班）；workweek固定单双休工作日；custom自定义星期多选；weekly仅兼容旧每周单日规则。",
  }),
  runAt: Type.Optional(Type.String({ description: "once必填，无时区后缀的北京时间YYYY-MM-DDTHH:mm:ss，必须为未来时间。" })),
  hour: Type.Optional(Type.Integer({ minimum: 0, maximum: 23, description: "所有重复规则必填，北京时间小时。" })),
  minute: Type.Optional(Type.Integer({ minimum: 0, maximum: 59, description: "所有重复规则必填，分钟。" })),
  weekDay: Type.Optional(Type.Integer({ minimum: 1, maximum: 7, description: "weekly必填，1周一、6周六、7周日。" })),
  weekDays: Type.Optional(Type.Array(Type.Integer({ minimum: 1, maximum: 7 }), { minItems: 1, maxItems: 7, uniqueItems: true, description: "custom必填，至少选择一天，1周一至7周日，例如每周一三五为[1,3,5]；按星期重复，不随调休变化。" })),
  workweek: Type.Optional(Type.Union([Type.Literal("single"), Type.Literal("double")], { description: "workweek必填：single单休，周一至周六执行；double双休，周一至周五执行。固定每周，不随节假日调休变化。用户未说明单休/双休时先询问。" })),
};
const listFields = {
  kind: Type.Optional(Type.Union([Type.Literal("all"), Type.Literal("once"), Type.Literal("recurring")])),
  keyword: Type.Optional(Type.String({ maxLength: 100 })),
  page: Type.Optional(Type.Integer({ minimum: 1, maximum: 10000 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 50 })),
};
function result(data: unknown) { return { content: [{ type: "text" as const, text: JSON.stringify(data) }], details: { data } }; }
async function request(path: string, permission: string, signal?: AbortSignal, body?: Record<string, unknown>, method?: "POST" | "PUT" | "DELETE", returnData = true) {
  await authorizeWorkbenchTool(permission, signal);
  return requestWorkbenchApi(`/agent/reports${path}`, signal, body, {
    requiredPermission: permission, method, mutation: !!method, returnData: !!method && returnData,
    serviceName: "报告中心", uncertainMessage: "操作结果尚未确认，请先查询报告中心核实，不能自动重复提交。",
  });
}
function validId(value: string) { if (!/^[a-f0-9-]{36}$/.test(value)) throw new Error("请先查询获取有效ID。"); return value; }

export function createReportToolsExtension(): ExtensionFactory {
  return pi => {
    pi.registerTool(defineTool({ name: "report_clock", label: "查看北京时间", description: "在解析今天、明天、周六等相对日期前读取当前北京时间。",
      parameters: Type.Object({}), execute: async () => result({ timeZone: "Asia/Shanghai", now: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "medium" }).format(new Date()), iso: new Date().toISOString() }) }));
    for (const [name, path, label] of [["report_task_list", "/tasks", "查询报告任务"], ["report_list", "", "查询报告列表"]]) {
      pi.registerTool(defineTool({ name, label, description: `${label}，仅当前用户，按一次性/定时分类、标题筛选并分页。total为匹配总数，不能把一页称全部。`,
        parameters: Type.Object(listFields, { additionalProperties: false }), executionMode: "parallel",
        execute: async (_id, params, signal) => result(await request(`${path}?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]): [string, string] => [k, String(v)]))}`, "agent:report:list", signal)) }));
    }
    for (const [name, path, label] of [["report_task_get", "/tasks/", "查看任务详情"], ["report_get", "/", "阅读报告正文"]]) {
      pi.registerTool(defineTool({ name, label, description: `${label}，只能使用列表返回的ID。`, parameters: Type.Object({ id }, { additionalProperties: false }),
        execute: async (_id, params, signal) => result(await request(`${path}${validId(params.id)}`, "agent:report:list", signal)) }));
    }
    pi.registerTool(defineTool({ name: "report_task_create", label: "创建报告任务", description: "用户明确要求到点生成报告时保存仅一次/每天/法定工作日/节假日及周末/单双休工作日/自定义星期任务，执行器未配置也可保存。先读取北京时间；缺少时间或要求则询问，不猜测。返回scheduleMessage时说明待日历更新；executionReady=false时说明任务已保存及executionMessage，不能承诺按时执行。结果未知先查询核实。",
      parameters: Type.Object(fields, { additionalProperties: false }), executionMode: "sequential",
      execute: async (callId, params, signal) => {
        return result(await request("/tasks", "agent:report:add", signal, { ...params, requestKey: callId }, "POST"));
      } }));
    pi.registerTool(defineTool({ name: "report_task_update", label: "修改报告任务", description: "先查询目标详情，保留用户未要求修改的字段，提交完整规则和version。修改从下次执行生效。",
      parameters: Type.Object({ id, version, ...fields }, { additionalProperties: false }), executionMode: "sequential",
      execute: async (_id, { id: taskId, ...params }, signal) => result(await request(`/tasks/${validId(taskId)}`, "agent:report:edit", signal, params, "PUT")) }));
    pi.registerTool(defineTool({ name: "report_task_status", label: "暂停或恢复任务", description: "暂停会取消等待中或执行中的报告，恢复按未来时间调度。过期一次性任务须先修改日期。",
      parameters: Type.Object({ id, version, action: Type.Union([Type.Literal("pause"), Type.Literal("resume")]) }, { additionalProperties: false }), executionMode: "sequential",
      execute: async (_id, { id: taskId, ...params }, signal) => result(await request(`/tasks/${validId(taskId)}/status`, "agent:report:edit", signal, params, "POST")) }));
    pi.registerTool(defineTool({ name: "report_task_delete", label: "删除报告任务", description: "用户明确要求删除时执行；先查询确认唯一目标，删除取消后续执行但保留已有报告。",
      parameters: Type.Object({ id, version }, { additionalProperties: false }), executionMode: "sequential",
      execute: async (_id, params, signal) => result(await request(`/tasks/${validId(params.id)}?version=${params.version}`, "agent:report:remove", signal, undefined, "DELETE", false)) }));
    pi.registerTool(defineTool({ name: "report_task_run", label: "立即生成一份报告", description: "用户明确要求立即执行已有任务时加入队列，不改变未来计划。不能自动重试结果未知的请求。",
      parameters: Type.Object({ id }, { additionalProperties: false }), executionMode: "sequential",
      execute: async (callId, params, signal) => result(await request(`/tasks/${validId(params.id)}/run`, "agent:report:edit", signal, { requestKey: callId }, "POST")) }));
    pi.registerTool(defineTool({ name: "report_delete", label: "删除已生成报告", description: "仅在用户明确要求删除这份报告时使用，不能删除执行中的报告。不影响其任务。",
      parameters: Type.Object({ id }, { additionalProperties: false }), executionMode: "sequential",
      execute: async (_id, params, signal) => result(await request(`/${validId(params.id)}`, "agent:report:remove", signal, undefined, "DELETE", false)) }));
  };
}
