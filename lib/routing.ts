// Tel-Agent Gateway — the routing engine.
// Decides who talks to a caller/sender: the AI agent, a human, or nobody.
// Rules are evaluated in priority order (lowest number first); the first
// match wins; no match falls back to DEFAULT_ACTION.

import type { Action, Channel, RoutingRule } from "./store";
import { config } from "./config";
import { getStore } from "./store";

export function matches(rule: RoutingRule, sender: string, channel: Channel): boolean {
  if (rule.channel !== "all" && rule.channel !== channel) return false;
  const s = (sender || "").toLowerCase();
  const p = (rule.pattern || "").toLowerCase();
  if (!p) return false;
  switch (rule.match) {
    case "exact": return s === p;
    case "prefix": return s.startsWith(p);
    case "suffix": return s.endsWith(p);
    case "contains": return s.includes(p);
    default: return false;
  }
}

export async function route(sender: string, channel: Channel): Promise<{ action: Action; rule?: RoutingRule }> {
  const rules = await getStore().listRules();
  for (const rule of rules) {
    if (matches(rule, sender, channel)) return { action: rule.action, rule };
  }
  return { action: config.routing.defaultAction };
}
