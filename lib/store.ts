// Tel-Agent Gateway — storage layer.
// Postgres when POSTGRES_URL is set; otherwise an in-memory store so the
// gateway always runs (honestly labelled as non-persistent).

import { config } from "./config";

export type Channel = "voice" | "sms" | "email" | "chat";
export type Action = "agent" | "human" | "block";

export type RoutingRule = {
  id: string;
  priority: number;
  match: "prefix" | "suffix" | "exact" | "contains";
  pattern: string;
  channel: Channel | "all";
  action: Action;
  note?: string;
};

export type Message = {
  role: "caller" | "agent" | "system";
  text: string;
  at: string;
};

export type Conversation = {
  id: string;
  channel: Channel;
  from: string;
  to?: string;
  status: "active" | "closed";
  startedAt: string;
  updatedAt: string;
  messages: Message[];
  transcript?: string;
  recordingUrl?: string;
  meta?: Record<string, string>;
};

export type Settings = {
  greeting?: string;
  systemPrompt?: string;
  defaultAction?: Action;
  businessContext?: string;
};

interface Store {
  ping(): Promise<boolean>;
  mode(): "postgres" | "memory";
  listConversations(channel?: Channel): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  upsertConversation(c: Conversation): Promise<void>;
  appendMessage(id: string, msg: Message): Promise<void>;
  closeConversation(id: string, transcript?: string, recordingUrl?: string): Promise<void>;
  listRules(): Promise<RoutingRule[]>;
  saveRule(rule: RoutingRule): Promise<void>;
  deleteRule(id: string): Promise<void>;
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
}

// ---------------------------------------------------------------- memory ---
type MemState = {
  conversations: Map<string, Conversation>;
  rules: Map<string, RoutingRule>;
  settings: Settings;
  seeded: boolean;
};

function mem(): Store {
  const state: MemState = {
    conversations: new Map(),
    rules: new Map(),
    settings: {},
    seeded: false,
  };

  const seed = () => {
    if (state.seeded) return;
    state.seeded = true;
    const raw = config.routing.seedRules;
    if (!raw) return;
    try {
      const rules = JSON.parse(raw) as RoutingRule[];
      for (const r of Array.isArray(rules) ? rules : []) {
        if (r && r.pattern && r.action) {
          state.rules.set(r.id || crypto.randomUUID(), { ...r, id: r.id || crypto.randomUUID() });
        }
      }
    } catch {
      // ignore malformed seed — routing falls back to DEFAULT_ACTION
    }
  };

  return {
    async ping() { return true; },
    mode() { return "memory"; },
    async listConversations(channel) {
      seed();
      const all = [...state.conversations.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      return channel ? all.filter((c) => c.channel === channel) : all;
    },
    async getConversation(id) { seed(); return state.conversations.get(id) ?? null; },
    async upsertConversation(c) { seed(); state.conversations.set(c.id, c); },
    async appendMessage(id, msg) {
      const c = state.conversations.get(id);
      if (c) { c.messages.push(msg); c.updatedAt = msg.at; }
    },
    async closeConversation(id, transcript, recordingUrl) {
      const c = state.conversations.get(id);
      if (c) {
        c.status = "closed";
        c.updatedAt = new Date().toISOString();
        if (transcript) c.transcript = transcript;
        if (recordingUrl) c.recordingUrl = recordingUrl;
      }
    },
    async listRules() { seed(); return [...state.rules.values()].sort((a, b) => a.priority - b.priority); },
    async saveRule(rule) { seed(); state.rules.set(rule.id, rule); },
    async deleteRule(id) { seed(); state.rules.delete(id); },
    async getSettings() { seed(); return state.settings; },
    async saveSettings(s) { seed(); state.settings = { ...state.settings, ...s }; },
  };
}

// -------------------------------------------------------------- postgres ---
function pg(): Store {
  // Lazy import so a missing @vercel/postgres install never breaks the build.
  type Sql = (strings: TemplateStringsArray, ...params: unknown[]) => Promise<Record<string, unknown>[]>;
  let sql: Sql | null = null;

  const client = async (): Promise<Sql> => {
    if (!sql) {
      const mod = await import("@vercel/postgres");
      sql = mod.sql as unknown as Sql;
    }
    return sql;
  };

  const ready = { done: false, failed: false };
  async function ensure(): Promise<void> {
    if (ready.done || ready.failed) return;
    try {
      const q = await client();
      await q`
        CREATE TABLE IF NOT EXISTS ta_conversations (
          id TEXT PRIMARY KEY,
          channel TEXT NOT NULL,
          from_addr TEXT NOT NULL,
          to_addr TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          messages JSONB NOT NULL DEFAULT '[]'::jsonb,
          transcript TEXT,
          recording_url TEXT,
          meta JSONB NOT NULL DEFAULT '{}'::jsonb
        )`;
      await q`
        CREATE TABLE IF NOT EXISTS ta_rules (
          id TEXT PRIMARY KEY,
          priority INT NOT NULL DEFAULT 100,
          match_type TEXT NOT NULL,
          pattern TEXT NOT NULL,
          channel TEXT NOT NULL DEFAULT 'all',
          action TEXT NOT NULL,
          note TEXT
        )`;
      await q`
        CREATE TABLE IF NOT EXISTS ta_settings (
          k TEXT PRIMARY KEY,
          v JSONB NOT NULL
        )`;
      // Seed rules from env once (idempotent).
      if (config.routing.seedRules) {
        try {
          const rules = JSON.parse(config.routing.seedRules) as RoutingRule[];
          for (const r of Array.isArray(rules) ? rules : []) {
            if (r && r.pattern && r.action) {
              const id = r.id || crypto.randomUUID();
              await q`
                INSERT INTO ta_rules (id, priority, match_type, pattern, channel, action, note)
                VALUES (${id}, ${r.priority ?? 100}, ${r.match || "prefix"}, ${r.pattern},
                        ${r.channel || "all"}, ${r.action}, ${r.note || null})
                ON CONFLICT (id) DO NOTHING`;
            }
          }
        } catch { /* malformed seed ignored */ }
      }
      ready.done = true;
    } catch {
      ready.failed = true;
    }
  }

  return {
    async ping() { await ensure(); return ready.done; },
    mode() { return "postgres"; },
    async listConversations(channel) {
      await ensure();
      if (!ready.done) return [];
      const q = await client();
      const rows = channel
        ? await q`SELECT * FROM ta_conversations WHERE channel = ${channel} ORDER BY started_at DESC LIMIT 200`
        : await q`SELECT * FROM ta_conversations ORDER BY started_at DESC LIMIT 200`;
      return rows.map(rowToConversation);
    },
    async getConversation(id) {
      await ensure();
      if (!ready.done) return null;
      const q = await client();
      const rows = await q`SELECT * FROM ta_conversations WHERE id = ${id}`;
      return rows.length ? rowToConversation(rows[0]) : null;
    },
    async upsertConversation(c) {
      await ensure();
      if (!ready.done) return;
      const q = await client();
      await q`
        INSERT INTO ta_conversations (id, channel, from_addr, to_addr, status, started_at, updated_at, messages, meta)
        VALUES (${c.id}, ${c.channel}, ${c.from}, ${c.to || null}, ${c.status}, ${c.startedAt}, ${c.updatedAt},
                ${JSON.stringify(c.messages)}::jsonb, ${JSON.stringify(c.meta || {})}::jsonb)
        ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, updated_at = EXCLUDED.updated_at,
          messages = EXCLUDED.messages, meta = EXCLUDED.meta`;
    },
    async appendMessage(id, msg) {
      await ensure();
      if (!ready.done) return;
      const q = await client();
      await q`
        UPDATE ta_conversations
        SET messages = messages || ${JSON.stringify([msg])}::jsonb, updated_at = now()
        WHERE id = ${id}`;
    },
    async closeConversation(id, transcript, recordingUrl) {
      await ensure();
      if (!ready.done) return;
      const q = await client();
      await q`
        UPDATE ta_conversations
        SET status = 'closed', updated_at = now(),
            transcript = COALESCE(${transcript || null}, transcript),
            recording_url = COALESCE(${recordingUrl || null}, recording_url)
        WHERE id = ${id}`;
    },
    async listRules() {
      await ensure();
      if (!ready.done) return [];
      const q = await client();
      const rows = await q`SELECT * FROM ta_rules ORDER BY priority ASC`;
      return rows.map((r) => ({
        id: String(r.id),
        priority: Number(r.priority),
        match: String(r.match_type) as RoutingRule["match"],
        pattern: String(r.pattern),
        channel: String(r.channel) as RoutingRule["channel"],
        action: String(r.action) as Action,
        note: r.note ? String(r.note) : undefined,
      }));
    },
    async saveRule(rule) {
      await ensure();
      if (!ready.done) return;
      const q = await client();
      await q`
        INSERT INTO ta_rules (id, priority, match_type, pattern, channel, action, note)
        VALUES (${rule.id}, ${rule.priority ?? 100}, ${rule.match}, ${rule.pattern}, ${rule.channel}, ${rule.action}, ${rule.note || null})
        ON CONFLICT (id) DO UPDATE SET priority = EXCLUDED.priority, match_type = EXCLUDED.match_type,
          pattern = EXCLUDED.pattern, channel = EXCLUDED.channel, action = EXCLUDED.action, note = EXCLUDED.note`;
    },
    async deleteRule(id) {
      await ensure();
      if (!ready.done) return;
      const q = await client();
      await q`DELETE FROM ta_rules WHERE id = ${id}`;
    },
    async getSettings() {
      await ensure();
      if (!ready.done) return {};
      const q = await client();
      const rows = await q`SELECT k, v FROM ta_settings`;
      const out: Record<string, string> = {};
      for (const row of rows) out[String(row.k)] = String((row.v as { value?: unknown })?.value ?? row.v ?? "");
      return out as Settings;
    },
    async saveSettings(s) {
      await ensure();
      if (!ready.done) return;
      const q = await client();
      for (const [k, v] of Object.entries(s)) {
        if (v === undefined) continue;
        await q`
          INSERT INTO ta_settings (k, v) VALUES (${k}, ${JSON.stringify({ value: v })}::jsonb)
          ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v`;
      }
    },
  };
}

function rowToConversation(r: Record<string, unknown>): Conversation {
  return {
    id: String(r.id),
    channel: String(r.channel) as Channel,
    from: String(r.from_addr),
    to: r.to_addr ? String(r.to_addr) : undefined,
    status: String(r.status) as Conversation["status"],
    startedAt: new Date(String(r.started_at)).toISOString(),
    updatedAt: new Date(String(r.updated_at)).toISOString(),
    messages: Array.isArray(r.messages) ? (r.messages as Message[]) : [],
    transcript: r.transcript ? String(r.transcript) : undefined,
    recordingUrl: r.recording_url ? String(r.recording_url) : undefined,
    meta: (r.meta as Record<string, string>) || {},
  };
}

let store: Store | null = null;
export function getStore(): Store {
  if (!store) store = config.postgresUrl ? pg() : mem();
  return store;
}
