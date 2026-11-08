import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import type { ExtensionAPI, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { createReportToolsExtension } from "../subagents/report-manager/tools.js";
import { runWithWorkbenchToolToken, authorizeWorkbenchTool, requestWorkbenchApi } from "../src/lib/workbench-api.js";
import { createPermissionExtension, PermissionBroker } from "../src/lib/permissions.js";
import { PrimaryAgentRegistry } from "../src/lib/primary-agents.js";
import { REPORT_TOOLS } from "../src/lib/agent-policy.js";
import { runWithReportExecution } from "../src/lib/report-worker-client.js";

test("report creation needs only user permission without a worker key and preserves execution readiness", async () => {
  const previous = { url: process.env.STOCK_API_BASE_URL, key: process.env.AGENT_REPORT_WORKER_KEY };
  const requests: { path: string; method: string; body: any }[] = [];
  let permission = "agent:report:add";
  const taskId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    requests.push({ path: req.url!, method: req.method!, body });
    assert.equal(req.headers.authorization, "Bearer current-user-token");
    res.setHeader("content-type", "application/json");
    if (req.url === "/getInfo") res.end(JSON.stringify({ code: 200, user: { userId: 42 }, permissions: ["agent:chat:use", permission] }));
    else res.end(JSON.stringify({ code: 200, data: { taskId, version: 2, executionReady: false, executionMessage: "报告执行器尚未配置，暂不能执行，请联系管理员" } }));
  });
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  process.env.STOCK_API_BASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  delete process.env.AGENT_REPORT_WORKER_KEY;
  const tools = new Map<string, any>();
  await createReportToolsExtension()({ registerTool: (tool: any) => tools.set(tool.name, tool) } as unknown as ExtensionAPI);
  try {
    assert.deepEqual([...tools.keys()].sort(), [...REPORT_TOOLS].sort());
    const clock = await tools.get("report_clock").execute("clock",{});
    assert.equal(JSON.parse(clock.content[0].text).timeZone,"Asia/Shanghai");
    const input = { title: "每周市场趋势", prompt: "本周股市趋势", scheduleType: "weekly", hour: 9, minute: 0, weekDay: 6 };
    const created = await runWithWorkbenchToolToken("current-user-token", () => tools.get("report_task_create").execute("call-one",input));
    assert.equal(JSON.parse(created.content[0].text).taskId,taskId);
    assert.equal(JSON.parse(created.content[0].text).executionReady,false);
    assert.match(JSON.parse(created.content[0].text).executionMessage,/尚未配置/);
    assert.deepEqual(requests.at(-1), { path: "/agent/reports/tasks", method: "POST", body: { ...input, requestKey: "call-one" } });
    let alarmId = 0;
    for (const rule of [
      { scheduleType: "workday" }, { scheduleType: "holiday" },
      { scheduleType: "workweek", workweek: "single" }, { scheduleType: "workweek", workweek: "double" },
      { scheduleType: "custom", weekDays: [1,3,5] },
    ]) {
      const payload = { title: "闹铃式报告", prompt: "生成报告", hour: 9, minute: 0, ...rule };
      const callId = "alarm-" + ++alarmId;
      await runWithWorkbenchToolToken("current-user-token", () => tools.get("report_task_create").execute(callId,payload));
      assert.deepEqual(requests.at(-1)?.body, { ...payload, requestKey: callId });
    }
    permission="agent:report:edit";
    await runWithWorkbenchToolToken("current-user-token", () => tools.get("report_task_update").execute("update",{ id: taskId,version: 2,...input }));
    assert.equal(requests.at(-1)?.method,"PUT"); assert.equal(requests.at(-1)?.body.version,2);
    permission="agent:report:remove";
    await runWithWorkbenchToolToken("current-user-token", () => tools.get("report_task_delete").execute("delete",{ id: taskId,version: 2 }));
    assert.equal(requests.at(-1)?.path,`/agent/reports/tasks/${taskId}?version=2`); assert.equal(requests.at(-1)?.method,"DELETE");
    await assert.rejects(runWithWorkbenchToolToken("current-user-token", () => tools.get("report_task_create").execute("forbidden",input)), /权限/);
  } finally { if (previous.url === undefined) delete process.env.STOCK_API_BASE_URL; else process.env.STOCK_API_BASE_URL=previous.url; if (previous.key === undefined) delete process.env.AGENT_REPORT_WORKER_KEY; else process.env.AGENT_REPORT_WORKER_KEY=previous.key; await new Promise<void>(done=>server.close(()=>done())); }
});

test("scheduled execution carries only a run lease and blocks all business writes", async () => {
  const oldUrl=process.env.STOCK_API_BASE_URL, oldKey=process.env.AGENT_REPORT_WORKER_KEY;
  const received: { path: string; body: any }[]=[];
  const server=createServer(async (req,res)=>{
    assert.equal(req.headers.authorization,undefined);
    assert.equal(req.headers["x-report-worker-key"],"test-report-worker-key-01234567890123456789");
    const chunks: Buffer[]=[]; for await (const chunk of req) chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks).toString()); received.push({ path:req.url!,body });
    assert.equal(body.runId,"run-one"); assert.equal(body.leaseToken,"lease-one"); assert.equal(body.userId,undefined);
    res.setHeader("content-type","application/json"); res.end(JSON.stringify({ code:200,data:{ authorized:true, price:12 } }));
  });
  server.listen(0,"127.0.0.1"); await once(server,"listening");
  process.env.STOCK_API_BASE_URL=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  process.env.AGENT_REPORT_WORKER_KEY="test-report-worker-key-01234567890123456789";
  try {
    await runWithReportExecution({ runId:"run-one",leaseToken:"lease-one" },async ()=>{
      await authorizeWorkbenchTool("stock:position:list");
      await requestWorkbenchApi("/stock/position/list",undefined,undefined,{ requiredPermission:"stock:position:list" });
      assert.equal(received.at(-1)?.path,"/agent/report-worker/data");
      await assert.rejects(requestWorkbenchApi("/stock/position",undefined,{ quantity:100 },{ requiredPermission:"stock:position:add",mutation:true }),/只读/);
      const runtime={ sessionId:"run",controller:new AbortController(),profile:await new PrimaryAgentRegistry("","").get("general") };
      async function guard(child?: { id:string; name:string; tools:string[] }) {
        let handler!: (event:ToolCallEvent)=>Promise<{block?:boolean}|undefined>;
        await createPermissionExtension(runtime,new PermissionBroker(),process.cwd(),child)({ on: (_event:string,fn:typeof handler)=>{ handler=fn; } } as unknown as ExtensionAPI);
        return (name:string,input:Record<string,unknown>={})=>handler({ type:"tool_call",toolCallId:"call",toolName:name,input } as ToolCallEvent);
      }
      const primary=await guard();
      assert.equal(await primary("Agent",{profile:"stock-analyst"}),undefined);
      for (const profile of ["report-manager","todo-recorder"]) assert.equal((await primary("Agent",{profile}))?.block,true);
      const portfolio=await guard({ id:"stock-portfolio",name:"portfolio",tools:["*"] });
      assert.equal(await portfolio("stock_position_list"),undefined);
      for (const name of ["stock_position_add","stock_watchlist_add","report_task_create","read","bash"]) assert.equal((await portfolio(name))?.block,true,name);
    });
  } finally { if (oldUrl===undefined) delete process.env.STOCK_API_BASE_URL; else process.env.STOCK_API_BASE_URL=oldUrl; if (oldKey===undefined) delete process.env.AGENT_REPORT_WORKER_KEY; else process.env.AGENT_REPORT_WORKER_KEY=oldKey; await new Promise<void>(done=>server.close(()=>done())); }
});
