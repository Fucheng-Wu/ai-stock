import type { PrimaryAgentInfo } from "../../../shared/types.js";
import { GENERAL_PRIMARY_ID, PRIMARY_PERMISSIONS, PRIMARY_TOOLS, STOCK_SUBAGENT_ID } from "./agent-policy.js";

/** Workbench roles intentionally exclude upstream Build/Plan and ambient custom roles. */
export const BUILTIN_PRIMARY_AGENTS: PrimaryAgentInfo[] = [{
  id: GENERAL_PRIMARY_ID,
  name: "普通 Agent",
  description: "正常对话，并将股票问题交给股票分析子代理",
  mode: "primary",
  builtIn: true,
  tools: PRIMARY_TOOLS,
  skills: [],
  extensions: [],
  permissions: PRIMARY_PERMISSIONS,
  systemPrompt: [
    "你是工作台的普通 Agent，负责正常对话、澄清需求和整理子代理的回答。",
    `股票、证券、ETF、行情、财经新闻与投资分析问题必须调用 Agent，profile 固定为 ${STOCK_SUBAGENT_ID}，由股票子代理获取数据和回答；不要凭记忆补充当前行情或代替子代理给出股票分析。`,
    "委派任务时带上用户的完整问题、明确的标的、已确认的候选、用户提供的数据和本轮所需的历史上下文。子代理不会自动继承聊天历史；不得传递登录令牌或其他凭证。",
    "用户本轮上传的图片会自动传给股票子代理。委派时说明图片中的问题，不要把图片的 base64 数据写入工具参数；无法辨认的代码、日期或指标要让用户确认。",
    "需要用户确认股票候选或补充信息时，把子代理的问题转达给用户，得到回复后连同前面的候选再次委派。",
    "你的唯一工具是 Agent。不能访问内部文件、目录、代码、配置或终端，不能调用 read、grep、find、ls、write、edit、bash、执行代码、MCP 或联网搜索，也不能委派代码或内部查询任务。",
    "非股票问题可以直接用文字回答；需要内部操作时说明当前没有相应能力。股票子代理返回失败或数据不足时如实说明，不编造结果。",
    "保留子代理提供的数据来源、行情时间、引用链接、风险条件和图表配置，不把推断改写成事实。",
  ].join("\n"),
}];

export class PrimaryAgentRegistry {
  constructor(_backendDir: string, _agentDir: string) {}

  async list(): Promise<PrimaryAgentInfo[]> {
    return BUILTIN_PRIMARY_AGENTS.map((profile) => ({
      ...profile, tools: [...PRIMARY_TOOLS], skills: [], extensions: [],
      permissions: PRIMARY_PERMISSIONS.map((rule) => ({ ...rule })),
    }));
  }

  async get(id: string): Promise<PrimaryAgentInfo> {
    const profile = (await this.list()).find((item) => item.id === id);
    if (!profile) throw new Error("当前工作台只允许使用普通 Agent，不能切换到 Build、Plan 或其他角色。");
    return profile;
  }
}
