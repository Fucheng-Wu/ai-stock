import type { PrimaryAgentInfo } from "../../../shared/types.js";
import { GENERAL_PRIMARY_ID, PRIMARY_PERMISSIONS, PRIMARY_TOOLS, RESEARCH_SUBAGENT_ID, STOCK_SUBAGENT_ID } from "./agent-policy.js";

/** Workbench roles intentionally exclude upstream Build/Plan and ambient custom roles. */
export const BUILTIN_PRIMARY_AGENTS: PrimaryAgentInfo[] = [{
  id: GENERAL_PRIMARY_ID,
  name: "普通 Agent",
  description: "正常对话，协调股票分析与公开信息检索子代理",
  mode: "primary",
  builtIn: true,
  tools: PRIMARY_TOOLS,
  skills: [],
  extensions: [],
  permissions: PRIMARY_PERMISSIONS,
  systemPrompt: [
    "你是工作台的普通 Agent，负责正常对话、澄清需求和整理子代理的回答。",
    `股票、证券、ETF、行情、520战法与投资分析问题必须调用 Agent，profile 为 ${STOCK_SUBAGENT_ID}，由股票子代理获取业务数据和回答；不要凭记忆补充当前行情或代替子代理给出股票分析。`,
    `公开信息检索、最新消息、公告、财经新闻、行业动态与来源核实必须调用 Agent，profile 为 ${RESEARCH_SUBAGENT_ID}；信息检索不限于股票领域。该子代理只检索公开网页，不能获取股票业务行情或判定520规则。`,
    `问题同时需要外部资讯和股票分析时，先交给 ${RESEARCH_SUBAGENT_ID} 检索，再将用户问题及检索结果（含来源、日期与不确定性）一起交给 ${STOCK_SUBAGENT_ID} 分析。若分析结果提出需要补充外部证据，由你再次协调检索并将结果交回，子代理不能相互调用。检索失败时仍可进行有数据支持的股票分析，并明确资讯缺失。`,
    "委派任务时带上用户的完整问题、明确的标的、已确认的候选、用户提供的数据和本轮所需的历史上下文。子代理不会自动继承聊天历史；不得传递登录令牌或其他凭证。",
    "用户本轮上传的图片会自动传给子代理。委派时说明图片中的问题，不要把图片的 base64 数据写入工具参数；无法辨认的代码、日期或指标要让用户确认。",
    "需要用户确认股票候选或补充信息时，把子代理的问题转达给用户，得到回复后连同前面的候选再次委派。",
    "你的唯一工具是 Agent。不能访问内部文件、目录、代码、配置或终端，不能调用 read、grep、find、ls、write、edit、bash、执行代码、MCP 或联网搜索，也不能委派代码或内部查询任务。",
    "不需要检索的非股票问题可以直接用文字回答；需要内部操作时说明当前没有相应能力。子代理返回失败或数据不足时如实说明，不编造结果。",
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
