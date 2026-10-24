import type { PermissionRule } from "../../../shared/types.js";

// Exact allowlists: neither profile files nor shared Pi settings can widen these capabilities.
export const GENERAL_PRIMARY_ID = "general";
export const STOCK_SUBAGENT_ID = "stock-analyst";
export const PRIMARY_TOOLS = ["Agent"];
export const STOCK_TOOLS = ["stock_search", "stock_quote", "stock_kline", "stock_analyze", "web_search"];
export const STOCK_SKILLS = ["stock-520", "stock-research"];

// The root policy also caps delegated tools; its own tool allowlist is only Agent.
export const STOCK_PERMISSIONS: PermissionRule[] = [
  { action: "*", resource: "*", effect: "deny" },
  ...STOCK_TOOLS.map((action): PermissionRule => ({ action, resource: "*", effect: "allow" })),
];
export const PRIMARY_PERMISSIONS: PermissionRule[] = [
  ...STOCK_PERMISSIONS,
  { action: "Agent", resource: "*", effect: "allow" },
];
