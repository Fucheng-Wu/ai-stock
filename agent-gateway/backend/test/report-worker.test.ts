import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSharedResources } from "../src/lib/shared-resources.js";
import { startReportWorker } from "../src/lib/report-worker.js";

async function listen(server: Server) { server.listen(0,"127.0.0.1"); await once(server,"listening"); return (server.address() as {port:number}).port; }
async function close(server: Server) { server.closeAllConnections(); await new Promise<void>(done=>server.close(()=>done())); }

test("background worker uses the real SDK with isolated read-only delegation and saves final Markdown", async () => {
  const root=await mkdtemp(join(tmpdir(),"report-worker-sdk-")), agent=join(root,"agent");
  const keys=["PI_AGENT_DIR","AGENT_DEFAULT_MODEL","DEEPSEEK_API_KEY","STOCK_API_BASE_URL","AGENT_REPORT_WORKER_KEY"];
  const saved=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const requests: any[]=[];
  const workerKey="test-only-background-report-key-0123456789012345", lease="lease-never-visible-to-model";
  let delivered=false, dataRequests=0;
  let completed!: (value:any)=>void;
  const finished=new Promise<any>(resolve=>{ completed=resolve; });
  const backend=createServer(async (req,res)=>{
    assert.equal(req.headers["x-report-worker-key"],workerKey);
    const chunks:Buffer[]=[]; for await (const chunk of req) chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks).toString());
    let data:unknown={authorized:true};
    if(req.url?.endsWith("/claim")) { data=delivered?null:{ runId:"scheduled-run",leaseToken:lease,title:"测试股票日报",prompt:"分析sh600519今日概况并注明来源",scheduledAt:Date.now() }; delivered=true; }
    else {
      assert.equal(body.runId,"scheduled-run"); assert.equal(body.leaseToken,lease); assert.equal(body.userId,undefined);
      if(req.url?.endsWith("/data")) { assert.equal(body.path,"/stock/analyzer/quote/sh600519"); data={stockCode:"sh600519",currentPrice:100,quoteTime:"2026-11-05 15:00:00"}; dataRequests++; }
      if(req.url?.endsWith("/finish")) completed(body);
    }
    res.writeHead(200,{"content-type":"application/json"}); res.end(JSON.stringify({code:200,data}));
  });
  const model=createServer(async (req,res)=>{
    const chunks:Buffer[]=[]; for await(const chunk of req) chunks.push(chunk);
    const body=JSON.parse(Buffer.concat(chunks).toString()); requests.push(body);
    const primary=body.tools.some((tool:any)=>tool.function.name==="Agent");
    const afterTool=body.messages.at(-1)?.role==="tool";
    const delta=afterTool?{content:primary?"# 测试股票日报\n\nsh600519最新价100，行情日期2026-11-05。来源：腾讯行情。\n\n数据为模拟验收证据。": "sh600519最新价100，来源腾讯行情，2026-11-05。"}
      :{tool_calls:[{index:0,id:`call_${requests.length}`,type:"function",function:{name:primary?"Agent":"stock_quote",arguments:JSON.stringify(primary?{profile:"stock-analyst",task:"查询sh600519最新行情"}:{stockCode:"sh600519"})}}]};
    res.writeHead(200,{"content-type":"text/event-stream"});
    const chunk=(delta:unknown,finish:string|null)=>`data: ${JSON.stringify({id:"reply",object:"chat.completion.chunk",created:1,model:"report-test",choices:[{index:0,delta,finish_reason:finish}]})}\n\n`;
    res.write(chunk(delta,null)); res.write(chunk({},afterTool?"stop":"tool_calls")); res.end("data: [DONE]\n\n");
  });
  let worker:ReturnType<typeof startReportWorker>|undefined, timeout:ReturnType<typeof setTimeout>|undefined;
  try {
    const backendPort=await listen(backend), modelPort=await listen(model);
    await mkdir(agent,{recursive:true});
    await writeFile(join(agent,"models.json"),JSON.stringify({providers:{deepseek:{baseUrl:`http://127.0.0.1:${modelPort}/v1`,api:"openai-completions",apiKey:"test-only",models:[{id:"report-test",name:"Report fixture",input:["text"],reasoning:true,contextWindow:32000,maxTokens:1024}]}}}));
    process.env.PI_AGENT_DIR=agent; process.env.AGENT_DEFAULT_MODEL="report-test"; process.env.DEEPSEEK_API_KEY="test-only";
    process.env.STOCK_API_BASE_URL=`http://127.0.0.1:${backendPort}`; process.env.AGENT_REPORT_WORKER_KEY=workerKey;
    worker=startReportWorker(await createSharedResources(root));
    const report=await Promise.race([finished,new Promise<never>((_resolve,reject)=>{ timeout=setTimeout(()=>reject(new Error("worker did not finish")),10000); })]);
    assert.equal(report.error,undefined); assert.match(report.content,/^# 测试股票日报/); assert.match(report.content,/来源/); assert.equal(dataRequests,1);
    assert.equal(requests.length,4,"primary delegates, child queries, then both complete");
    const schema=requests[0].tools[0].function.parameters.properties.profile;
    const profileIds=(schema.anyOf || [schema]).map((item:any)=>item.const);
    assert.ok(!profileIds.includes("report-manager")); assert.ok(!profileIds.includes("todo-recorder"));
    const serialized=JSON.stringify(requests);
    assert.ok(!serialized.includes(workerKey)); assert.ok(!serialized.includes(lease));
    assert.ok(!serialized.includes("report-preview-only"));
    const files=await readdir(agent,{recursive:true});
    assert.ok(!files.some(file=>String(file).endsWith(".jsonl")),"background sessions must not create conversation JSONL files");
  } finally {
    clearTimeout(timeout); await worker?.stop();
    for(const key of keys) { if(saved[key]===undefined) delete process.env[key]; else process.env[key]=saved[key]; }
    await Promise.all([close(backend),close(model)]);
    // This directory was created specifically for this fixture and cannot point at the user workspace.
    assert.ok(root.startsWith(join(tmpdir(),"report-worker-sdk-"))); await rm(root,{recursive:true,force:true});
  }
});
