import type { PermissionRule } from "../../../shared/types.js";

// Exact allowlists: neither profile files nor shared Pi settings can widen these capabilities.
export const GENERAL_PRIMARY_ID = "general";
export const STOCK_SUBAGENT_ID = "stock-analyst";
export const RESEARCH_SUBAGENT_ID = "web-researcher";
export const PRIMARY_TOOLS = ["Agent"];
export const STOCK_TOOLS = ["stock_search", "stock_quote", "stock_kline", "stock_analyze"];
export const STOCK_SKILLS = ["stock-520"];
export const RESEARCH_TOOLS = ["web_search"];
export const RESEARCH_SKILLS = ["web-research"];

// The root policy also caps delegated tools; its own tool allowlist is only Agent.
export const STOCK_PERMISSIONS: PermissionRule[] = [
  { action: "*", resource: "*", effect: "deny" },
  ...STOCK_TOOLS.map((action): PermissionRule => ({ action, resource: "*", effect: "allow" })),
];
export const RESEARCH_PERMISSIONS: PermissionRule[] = [
  { action: "*", resource: "*", effect: "deny" },
  ...RESEARCH_TOOLS.map((action): PermissionRule => ({ action, resource: "*", effect: "allow" })),
];
export const SUBAGENT_POLICIES = [
  { id: STOCK_SUBAGENT_ID, tools: STOCK_TOOLS, skills: STOCK_SKILLS, permissions: STOCK_PERMISSIONS },
  { id: RESEARCH_SUBAGENT_ID, tools: RESEARCH_TOOLS, skills: RESEARCH_SKILLS, permissions: RESEARCH_PERMISSIONS },
];
export const PRIMARY_PERMISSIONS: PermissionRule[] = [
  ...STOCK_PERMISSIONS,
  ...RESEARCH_TOOLS.map((action): PermissionRule => ({ action, resource: "*", effect: "allow" })),
  { action: "Agent", resource: "*", effect: "allow" },
];
