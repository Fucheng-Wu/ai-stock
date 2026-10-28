import type { PermissionRule } from "../../../shared/types.js";

// Exact allowlists: neither profile files nor shared Pi settings can widen these capabilities.
export const GENERAL_PRIMARY_ID = "general";
export const STOCK_SUBAGENT_ID = "stock-analyst";
export const RESEARCH_SUBAGENT_ID = "web-researcher";
export const SCREENER_SUBAGENT_ID = "stock-screener";
export const PORTFOLIO_SUBAGENT_ID = "stock-portfolio";
export const TODO_SUBAGENT_ID = "todo-recorder";
export const PRIMARY_TOOLS = ["Agent"];
export const STOCK_TOOLS = ["stock_search", "stock_quote", "stock_kline", "stock_analyze"];
export const STOCK_SKILLS = ["stock-520"];
export const RESEARCH_TOOLS = ["web_search"];
export const RESEARCH_SKILLS = ["web-research"];
export const SCREENER_TOOLS = ["stock_screen", "stock_screen_detail"];
export const SCREENER_SKILLS: string[] = [];
export const PORTFOLIO_TOOLS = ["stock_search", "stock_watchlist_add", "stock_position_add", "stock_watchlist_list", "stock_position_list"];
export const PORTFOLIO_SKILLS: string[] = [];
export const TODO_TOOLS = ["todo_add", "todo_list"];
export const TODO_SKILLS: string[] = [];

// The root policy also caps delegated tools; its own tool allowlist is only Agent.
export const STOCK_PERMISSIONS: PermissionRule[] = [
  { action: "*", resource: "*", effect: "deny" },
  ...STOCK_TOOLS.map((action): PermissionRule => ({ action, resource: "*", effect: "allow" })),
];
export const RESEARCH_PERMISSIONS: PermissionRule[] = [
  { action: "*", resource: "*", effect: "deny" },
  ...RESEARCH_TOOLS.map((action): PermissionRule => ({ action, resource: "*", effect: "allow" })),
];
export const SCREENER_PERMISSIONS: PermissionRule[] = [
  { action: "*", resource: "*", effect: "deny" },
  ...SCREENER_TOOLS.map((action): PermissionRule => ({ action, resource: "*", effect: "allow" })),
];
export const PORTFOLIO_PERMISSIONS: PermissionRule[] = [
  { action: "*", resource: "*", effect: "deny" },
  ...PORTFOLIO_TOOLS.map((action): PermissionRule => ({ action, resource: "*", effect: "allow" })),
];
export const TODO_PERMISSIONS: PermissionRule[] = [
  { action: "*", resource: "*", effect: "deny" },
  ...TODO_TOOLS.map((action): PermissionRule => ({ action, resource: "*", effect: "allow" })),
];
export const SUBAGENT_POLICIES = [
  { id: STOCK_SUBAGENT_ID, tools: STOCK_TOOLS, skills: STOCK_SKILLS, permissions: STOCK_PERMISSIONS },
  { id: RESEARCH_SUBAGENT_ID, tools: RESEARCH_TOOLS, skills: RESEARCH_SKILLS, permissions: RESEARCH_PERMISSIONS },
  { id: SCREENER_SUBAGENT_ID, tools: SCREENER_TOOLS, skills: SCREENER_SKILLS, permissions: SCREENER_PERMISSIONS },
  { id: PORTFOLIO_SUBAGENT_ID, tools: PORTFOLIO_TOOLS, skills: PORTFOLIO_SKILLS, permissions: PORTFOLIO_PERMISSIONS },
  { id: TODO_SUBAGENT_ID, tools: TODO_TOOLS, skills: TODO_SKILLS, permissions: TODO_PERMISSIONS },
];
export const PRIMARY_PERMISSIONS: PermissionRule[] = [
  ...STOCK_PERMISSIONS,
  ...RESEARCH_TOOLS.map((action): PermissionRule => ({ action, resource: "*", effect: "allow" })),
  ...SCREENER_TOOLS.map((action): PermissionRule => ({ action, resource: "*", effect: "allow" })),
  ...PORTFOLIO_TOOLS.map((action): PermissionRule => ({ action, resource: "*", effect: "allow" })),
  ...TODO_TOOLS.map((action): PermissionRule => ({ action, resource: "*", effect: "allow" })),
  { action: "Agent", resource: "*", effect: "allow" },
];
