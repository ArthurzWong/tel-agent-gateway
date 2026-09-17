import { getStore } from "@/lib/store";
import { readiness, config } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * GET  /api/console — conversations, rules, settings, readiness.
 * POST /api/console — mutations: add/update/delete rule, save settings,
 *                     delete conversation. Guarded by ADMIN_TOKEN when set.
 *
 * POST body: { op: "rule.save" | "rule.delete" | "settings.save" | "conv.delete", ... }
 */
async function authorized(req: Request): Promise<boolean> {
  if (!config.adminToken) return true;
  const h = req.headers.get("x-admin-token") || "";
  if (h === config.adminToken) return true;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${config.adminToken}`;
}

export async function GET(req: Request) {
  if (!(await authorized(req))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const store = getStore();
  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") as "voice" | "sms" | "email" | "chat" | null;
  const [conversations, rules, settings] = await Promise.all([
    store.listConversations(channel || undefined),
    store.listRules(),
    store.getSettings(),
  ]);
  return Response.json({ conversations, rules, settings, readiness: readiness(), mode: store.mode() });
}

export async function POST(req: Request) {
  if (!(await authorized(req))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const op = String(body.op || "");
  const store = getStore();

  switch (op) {
    case "rule.save": {
      const rule = body.rule as { id?: string; priority?: number; match?: string; pattern?: string; channel?: string; action?: string; note?: string } | undefined;
      if (!rule?.pattern || !rule.action) {
        return Response.json({ error: "rule.pattern and rule.action are required" }, { status: 400 });
      }
      const validActions = ["agent", "human", "block"];
      const validMatches = ["prefix", "suffix", "exact", "contains"];
      const validChannels = ["all", "voice", "sms", "email", "chat"];
      if (!validActions.includes(rule.action)) return Response.json({ error: "invalid action" }, { status: 400 });
      const match = validMatches.includes(String(rule.match)) ? String(rule.match) : "prefix";
      const channel = validChannels.includes(String(rule.channel)) ? String(rule.channel) : "all";
      await store.saveRule({
        id: rule.id || crypto.randomUUID(),
        priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : 100,
        match: match as "prefix" | "suffix" | "exact" | "contains",
        pattern: String(rule.pattern),
        channel: channel as "all" | "voice" | "sms" | "email" | "chat",
        action: rule.action as "agent" | "human" | "block",
        note: rule.note ? String(rule.note) : undefined,
      });
      return Response.json({ ok: true });
    }
    case "rule.delete": {
      const id = String(body.id || "");
      if (!id) return Response.json({ error: "id required" }, { status: 400 });
      await store.deleteRule(id);
      return Response.json({ ok: true });
    }
    case "settings.save": {
      const s = (body.settings || {}) as Record<string, string>;
      const clean: Record<string, string> = {};
      for (const key of ["greeting", "systemPrompt", "defaultAction", "businessContext"]) {
        if (typeof s[key] === "string" && s[key].length < 8000) clean[key] = s[key];
      }
      if (clean.defaultAction && !["agent", "human", "block"].includes(clean.defaultAction)) {
        delete clean.defaultAction;
      }
      await store.saveSettings(clean);
      return Response.json({ ok: true });
    }
    case "conv.delete": {
      // The store interface has no delete for conversations in this build;
      // closing keeps the audit trail while hiding it from the live list.
      const id = String(body.id || "");
      if (!id) return Response.json({ error: "id required" }, { status: 400 });
      await store.closeConversation(id, "Deleted from console.");
      return Response.json({ ok: true });
    }
    default:
      return Response.json({ error: "unknown op" }, { status: 400 });
  }
}
