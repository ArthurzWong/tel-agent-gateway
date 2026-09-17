"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { WebVoice } from "@/lib/webvoice";

type Channel = "voice" | "sms" | "email" | "chat";
type Action = "agent" | "human" | "block";

type Rule = { id: string; priority: number; match: string; pattern: string; channel: string; action: Action; note?: string };
type Msg = { role: "caller" | "agent" | "system"; text: string; at: string };
type Conv = {
  id: string; channel: Channel; from: string; to?: string; status: "active" | "closed";
  startedAt: string; updatedAt: string; messages: Msg[]; transcript?: string; meta?: Record<string, string>;
};
type Settings = { greeting?: string; systemPrompt?: string; defaultAction?: string; businessContext?: string };
type Readiness = Record<string, string>;
type ConsoleData = {
  conversations: Conv[]; rules: Rule[]; settings: Settings;
  readiness: Readiness; mode: string;
};

const TABS = ["Overview", "Conversations", "Routing", "Live call", "Settings"] as const;
type Tab = (typeof TABS)[number];

export default function ConsolePage() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<ConsoleData | null>(null);
  const [token, setToken] = useState("");
  const [needsToken, setNeedsToken] = useState(false);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);

  const flash = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/console", { headers: t ? { "x-admin-token": t } : {} });
      if (res.status === 401) { setNeedsToken(true); setData(null); return; }
      setNeedsToken(false);
      if (res.ok) setData((await res.json()) as ConsoleData);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = window.sessionStorage.getItem("ta-token") || "";
    setToken(saved);
    void load(saved);
  }, [load]);

  const saveToken = (t: string) => {
    window.sessionStorage.setItem("ta-token", t);
    setToken(t);
    void load(t);
  };

  async function mutate(body: Record<string, unknown>, okMsg: string) {
    const res = await fetch("/api/console", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "x-admin-token": token } : {}) },
      body: JSON.stringify(body),
    });
    if (res.ok) { flash(okMsg); await load(token); }
    else flash(res.status === 401 ? "Unauthorized — check the admin token" : "Operation failed");
    return res.ok;
  }

  if (needsToken) {
    return (
      <main className="console-wrap">
        <Link href="/" className="back-link">← Back to site</Link>
        <div className="console-title">🔒 Console locked</div>
        <p className="console-sub">This deployment sets ADMIN_TOKEN. Enter it to manage the gateway.</p>
        <div className="card" style={{ maxWidth: 460, marginTop: 18 }}>
          <div className="card-body">
            <div className="field">
              <label>Admin token</label>
              <input type="password" value={token} placeholder="paste ADMIN_TOKEN"
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveToken(token); }} />
            </div>
            <button className="btn btn-primary" onClick={() => saveToken(token)}>Unlock</button>
          </div>
        </div>
        {toast && <div className="toast">{toast}</div>}
      </main>
    );
  }

  return (
    <main className="console-wrap">
      <Link href="/" className="back-link">← Back to site</Link>
      <div className="console-head">
        <div>
          <div className="console-title">☏ Tel-Agent Console</div>
          <div className="console-sub">Gateway operations — conversations, routing, live call, persona</div>
        </div>
        <span className={`mode-badge ${data?.mode === "postgres" ? "pg" : ""}`}>
          {loading ? "loading…" : data?.mode === "postgres" ? "● postgres · persistent" : "● in-memory · resets on cold start"}
        </span>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === "Overview" && data && <Overview data={data} onGoto={setTab} />}
      {tab === "Conversations" && data && <Conversations data={data} />}
      {tab === "Routing" && data && <Routing data={data} mutate={mutate} />}
      {tab === "Live call" && <LiveCall flash={flash} token={token} />}
      {tab === "Settings" && data && <SettingsTab data={data} mutate={mutate} />}

      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

/* ------------------------------- Overview ------------------------------- */
function Overview({ data, onGoto }: { data: ConsoleData; onGoto: (t: Tab) => void }) {
  const r = data.readiness;
  const checks: { label: string; detail: string; ok: boolean }[] = [
    { label: "LLM brain", detail: r.llmDetail || "", ok: r.llm === "true" || r.llm === true as unknown as string },
    { label: "Voice channel", detail: r.voice || "", ok: (r.voice || "").startsWith("Twilio") },
    { label: "Email replies", detail: r.emailOut || "", ok: (r.emailOut || "").startsWith("Outbound") },
    { label: "Human transfer", detail: r.forward || "", ok: (r.forward || "").startsWith("Human") },
    { label: "Storage", detail: r.storage || "", ok: data.mode === "postgres" },
    { label: "Console auth", detail: r.admin || "", ok: (r.admin || "").startsWith("Console") },
  ];
  const convs = data.conversations;
  const byChan = (c: Channel) => convs.filter((x) => x.channel === c).length;

  return (
    <div className="panel">
      <div className="card">
        <div className="card-head"><div className="card-title">📡 Deployment readiness</div></div>
        <div className="card-body readiness-grid">
          {checks.map((c) => (
            <div key={c.label} className={`check ${c.ok ? "ok" : "warn"}`}>
              <span className="sym">{c.ok ? "✔" : "△"}</span>
              <span><span className="lbl">{c.label}</span><br /><span className="detail">{c.detail}</span></span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">🧾 Conversations</div>
          <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => onGoto("Conversations")}>View archive</button>
        </div>
        <table className="tbl">
          <thead><tr><th>Voice</th><th>SMS</th><th>Email</th><th>Chat</th><th>Total</th><th>Active</th></tr></thead>
          <tbody>
            <tr>
              <td className="mono">{byChan("voice")}</td>
              <td className="mono">{byChan("sms")}</td>
              <td className="mono">{byChan("email")}</td>
              <td className="mono">{byChan("chat")}</td>
              <td className="mono">{convs.length}</td>
              <td className="mono">{convs.filter((c) => c.status === "active").length}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-head"><div className="card-title">🔌 Webhook endpoints</div></div>
        <table className="tbl">
          <thead><tr><th>Channel</th><th>Endpoint</th><th>Point here</th></tr></thead>
          <tbody>
            <tr><td><span className="chan-badge voice">voice</span></td><td className="mono">POST /api/voice</td><td>Twilio number → “A call comes in”</td></tr>
            <tr><td><span className="chan-badge sms">sms</span></td><td className="mono">POST /api/sms</td><td>Twilio number → “A message comes in”</td></tr>
            <tr><td><span className="chan-badge email">email</span></td><td className="mono">POST /api/email</td><td>SendGrid Inbound Parse / Mailgun route</td></tr>
            <tr><td><span className="chan-badge chat">chat</span></td><td className="mono">POST /api/brain</td><td>Any client · SSE streaming</td></tr>
            <tr><td><span className="chan-badge">ops</span></td><td className="mono">GET /api/health</td><td>Uptime probe</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ----------------------------- Conversations ----------------------------- */
function Conversations({ data }: { data: ConsoleData }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = data.conversations.find((c) => c.id === openId) || null;

  if (open) {
    return (
      <div className="panel">
        <div>
          <button className="btn btn-ghost" style={{ padding: "7px 14px", fontSize: 13 }} onClick={() => setOpenId(null)}>← All conversations</button>
        </div>
        <div className="card">
          <div className="card-head">
            <div className="card-title">
              <span className={`chan-badge ${open.channel}`}>{open.channel}</span>
              {open.from}{open.to ? ` → ${open.to}` : ""}
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className={`status-pill ${open.status}`}>{open.status}</span>
              <span className="mono" style={{ color: "var(--text-faint)", fontSize: 12 }}>{new Date(open.startedAt).toLocaleString()}</span>
            </div>
          </div>
          <div className="card-body transcript">
            {open.messages.length === 0 && <div className="empty"><div className="big">🤫</div>No turns recorded.</div>}
            {open.messages.map((m, i) => (
              <div key={i} className={`tr-msg ${m.role === "system" ? "caller" : m.role}`}>
                <span className="who">{m.role.toUpperCase()} · {new Date(m.at).toLocaleTimeString()}</span>
                {m.text}
              </div>
            ))}
          </div>
          {open.transcript && (
            <div className="card-body" style={{ borderTop: "1px solid var(--border)", color: "var(--text-dim)", fontSize: 13 }}>
              <strong style={{ color: "var(--text)" }}>Summary:</strong> {open.transcript}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head"><div className="card-title">🗂 Archive ({data.conversations.length})</div></div>
      {data.conversations.length === 0 ? (
        <div className="empty"><div className="big">📭</div>No conversations yet. Call the number, send an SMS, email the inbox, or use the live demo on the home page.</div>
      ) : (
        <table className="tbl">
          <thead><tr><th>Channel</th><th>From</th><th>Turns</th><th>Status</th><th>Started</th></tr></thead>
          <tbody>
            {data.conversations.map((c) => (
              <tr key={c.id} className="rowlink" onClick={() => setOpenId(c.id)}>
                <td><span className={`chan-badge ${c.channel}`}>{c.channel}</span></td>
                <td className="mono">{c.from}</td>
                <td className="mono">{c.messages.length}</td>
                <td><span className={`status-pill ${c.status}`}>{c.status}</span></td>
                <td className="mono">{new Date(c.startedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* -------------------------------- Routing -------------------------------- */
function Routing({ data, mutate }: { data: ConsoleData; mutate: (b: Record<string, unknown>, m: string) => Promise<boolean> }) {
  const empty = { id: "", priority: 10, match: "prefix", pattern: "", channel: "all", action: "agent" as Action, note: "" };
  const [draft, setDraft] = useState<typeof empty>(empty);
  const editing = Boolean(draft.id);

  async function save() {
    if (!draft.pattern.trim()) return;
    const ok = await mutate({ op: "rule.save", rule: draft }, editing ? "Rule updated" : "Rule added");
    if (ok) setDraft(empty);
  }

  return (
    <div className="panel">
      <div className="card">
        <div className="card-head"><div className="card-title">➕ {editing ? "Edit rule" : "New rule"}</div></div>
        <div className="card-body">
          <div className="form-row">
            <div className="field">
              <label>Match type</label>
              <select value={draft.match} onChange={(e) => setDraft({ ...draft, match: e.target.value })}>
                <option value="prefix">starts with (caller ID prefix)</option>
                <option value="suffix">ends with</option>
                <option value="exact">exact match</option>
                <option value="contains">contains</option>
              </select>
            </div>
            <div className="field">
              <label>Pattern</label>
              <input value={draft.pattern} placeholder="+1555… or sender@domain.com"
                onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} />
              <span className="hint">Compared lower-cased against the caller ID / sender address.</span>
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Channel</label>
              <select value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })}>
                <option value="all">all channels</option>
                <option value="voice">voice only</option>
                <option value="sms">SMS only</option>
                <option value="email">email only</option>
                <option value="chat">web chat only</option>
              </select>
            </div>
            <div className="field">
              <label>Action</label>
              <select value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value as Action })}>
                <option value="agent">agent — the AI answers</option>
                <option value="human">human — dial the forward number</option>
                <option value="block">block — reject silently</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>Priority (lower runs first)</label>
              <input type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: parseInt(e.target.value, 10) || 0 })} />
            </div>
            <div className="field">
              <label>Note (optional)</label>
              <input value={draft.note} placeholder="e.g. VIP client" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" onClick={save} disabled={!draft.pattern.trim()}>{editing ? "Save changes" : "Add rule"}</button>
            {editing && <button className="btn btn-ghost" onClick={() => setDraft(empty)}>Cancel</button>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div className="card-title">📋 Rules ({data.rules.length}) — first match wins</div></div>
        {data.rules.length === 0 ? (
          <div className="empty"><div className="big">🚦</div>No rules yet — everything falls through to the default action.</div>
        ) : (
          <table className="tbl">
            <thead><tr><th>#</th><th>Pattern</th><th>Match</th><th>Channel</th><th>Action</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {data.rules.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.priority}</td>
                  <td className="mono">{r.pattern}</td>
                  <td className="mono">{r.match}</td>
                  <td><span className={`chan-badge ${r.channel === "all" ? "" : r.channel}`}>{r.channel}</span></td>
                  <td><span className={`action-badge ${r.action}`}>{r.action}</span></td>
                  <td>{r.note || "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button className="btn btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }}
                      onClick={() => setDraft({ ...r, note: r.note || "" })}>Edit</button>{" "}
                    <button className="btn btn-danger" style={{ padding: "4px 10px", fontSize: 12 }}
                      onClick={() => void mutate({ op: "rule.delete", id: r.id }, "Rule deleted")}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Live call ------------------------------- */
function LiveCall({ flash, token }: { flash: (m: string) => void; token: string }) {
  const [state, setState] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [partial, setPartial] = useState("");
  const [level, setLevel] = useState(0);
  const [turns, setTurns] = useState<{ role: "caller" | "agent"; text: string }[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [convId, setConvId] = useState<string | null>(null);
  const [textFallback, setTextFallback] = useState("");
  const voiceRef = useRef<WebVoice | null>(null);
  const convRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const supportsStt = typeof window !== "undefined" && WebVoice.supported();

  useEffect(() => {
    if (state !== "listening") return;
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [state]);

  const speak = useCallback((text: string) => {
    setState("speaking");
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.rate = 1.03;
      u.onend = () => setState("listening");
      u.onerror = () => setState("listening");
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch {
      setState("listening");
    }
  }, []);

  const sendUtterance = useCallback(async (text: string) => {
    if (!text.trim() || busyRef.current) return;
    busyRef.current = true;
    setPartial("");
    setTurns((t) => [...t, { role: "caller", text }]);
    setState("thinking");
    try {
      const res = await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "x-admin-token": token } : {}) },
        body: JSON.stringify({ message: text, conversationId: convRef.current, channel: "voice" }),
      });
      if (!res.ok || !res.body) throw new Error("brain unreachable");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop() || "";
        for (const ev of events) {
          for (const line of ev.split("\n")) {
            if (!line.startsWith("data:")) continue;
            try {
              const j = JSON.parse(line.slice(5)) as { delta?: string; done?: boolean; conversationId?: string };
              if (j.delta) { acc += j.delta; setPartial(acc); }
              if (j.done && j.conversationId) { convRef.current = j.conversationId; setConvId(j.conversationId); }
            } catch { /* partial */ }
          }
        }
      }
      if (acc) {
        setTurns((t) => [...t, { role: "agent", text: acc }]);
        speak(acc);
      } else setState("listening");
    } catch {
      flash("Could not reach /api/brain — check deployment");
      setState("listening");
    } finally {
      busyRef.current = false;
      setPartial("");
    }
  }, [flash, speak, token]);

  async function startCall() {
    setTurns([]); setSeconds(0); convRef.current = null; setConvId(null);
    try {
      const res = await fetch("/api/webcall?u=browser", { method: "POST" });
      if (res.ok) {
        const j = (await res.json()) as { conversationId: string; greeting: string };
        convRef.current = j.conversationId;
        setConvId(j.conversationId);
        setTurns([{ role: "agent", text: j.greeting }]);
        speak(j.greeting);
      }
    } catch { /* session shell optional — brain still creates one */ }
    try {
      const v = new WebVoice({
        onPartial: setPartial,
        onUtterance: (t) => void sendUtterance(t),
        onLevel: setLevel,
        onState: (s) => setState(s),
      });
      voiceRef.current = v;
      await v.start();
      if (!WebVoice.supported()) {
        flash("This browser has no speech recognition — use the text box to drive the call");
      }
    } catch {
      flash("Microphone permission denied — use the text box instead");
    }
  }

  function endCall() {
    voiceRef.current?.stop();
    voiceRef.current = null;
    window.speechSynthesis?.cancel();
    setState("idle"); setPartial(""); setLevel(0);
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const live = state !== "idle";

  return (
    <div className="panel">
      <div className="card">
        <div className="card-head">
          <div className="card-title">🎧 Live browser call</div>
          <span className="chat-status">{convId ? `session ${convId.slice(0, 8)}` : "no session"} · {supportsStt ? "mic STT available" : "text-driven mode"}</span>
        </div>
        <div className="call-stage">
          <div className={`call-avatar ${state === "listening" || state === "thinking" ? "ringing" : ""}`}>
            {state === "speaking" ? "🔊" : state === "thinking" ? "💬" : "🤖"}
          </div>
          <div className="call-timer">{live ? `${mm}:${ss}` : "--:--"} · {state}</div>
          <div className="vu" aria-hidden>
            {Array.from({ length: 12 }).map((_, i) => (
              <span key={i} style={{ height: live ? `${4 + Math.max(2, level * 30 * Math.abs(Math.sin(i * 1.7 + Date.now() / 90)))}px` : 4 }} />
            ))}
          </div>
          <div className="mic-note">
            {state === "listening" ? "🎤 listening — just talk" : state === "thinking" ? "brain is replying…" : state === "speaking" ? "agent speaking — interrupt anytime" : "press Call to open the mic"}
          </div>
          {partial && <div className="msg caller" style={{ maxWidth: "90%" }}>{partial}</div>}
          <div style={{ display: "flex", gap: 12 }}>
            {!live
              ? <button className="btn btn-primary" onClick={() => void startCall()}>📞 Call the agent</button>
              : <button className="btn btn-danger" onClick={endCall}>End call</button>}
          </div>
          <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 520 }}>
            <input className="chat-input" style={{ flex: 1, background: "var(--bg)", border: "1px solid var(--border-strong)", color: "var(--text)", borderRadius: 9, padding: "10px 13px", outline: "none" }}
              value={textFallback} placeholder={live ? "or type to the agent…" : "start a call, or type here"}
              onChange={(e) => setTextFallback(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && textFallback.trim()) { void sendUtterance(textFallback); setTextFallback(""); } }} />
            <button className="btn btn-ghost" disabled={!textFallback.trim()}
              onClick={() => { void sendUtterance(textFallback); setTextFallback(""); }}>Send</button>
          </div>
        </div>
      </div>
      <div className="card">
        <div className="card-head"><div className="card-title">🎙 Call transcript ({turns.length})</div></div>
        <div className="card-body transcript">
          {turns.length === 0 && <div className="empty"><div className="big">☎️</div>The live call transcript appears here. Everything is archived like a real phone call.</div>}
          {turns.map((m, i) => (
            <div key={i} className={`tr-msg ${m.role}`}>
              <span className="who">{m.role.toUpperCase()}</span>{m.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Settings -------------------------------- */
function SettingsTab({ data, mutate }: { data: ConsoleData; mutate: (b: Record<string, unknown>, m: string) => Promise<boolean> }) {
  const [s, setS] = useState<Settings>({
    greeting: data.settings.greeting || "",
    systemPrompt: data.settings.systemPrompt || "",
    defaultAction: data.settings.defaultAction || "agent",
    businessContext: data.settings.businessContext || "",
  });

  return (
    <div className="panel">
      <div className="card">
        <div className="card-head">
          <div className="card-title">🎛 Agent persona &amp; defaults</div>
          <span className="chat-status">saved to {data.mode === "postgres" ? "postgres" : "instance memory"} · overrides env</span>
        </div>
        <div className="card-body">
          <div className="field">
            <label>Default action for unmatched contacts</label>
            <select value={s.defaultAction} onChange={(e) => setS({ ...s, defaultAction: e.target.value })}>
              <option value="agent">agent — the AI answers</option>
              <option value="human">human — dial the forward number</option>
              <option value="block">block — reject silently</option>
            </select>
            <span className="hint">Rules take precedence; this is the fallback for everyone else.</span>
          </div>
          <div className="field">
            <label>Business context</label>
            <textarea value={s.businessContext} placeholder="Opening hours, address, services, pricing, anything the receptionist should know…"
              onChange={(e) => setS({ ...s, businessContext: e.target.value })} />
          </div>
          <div className="field">
            <label>Full system prompt (optional — replaces the generated persona)</label>
            <textarea value={s.systemPrompt} placeholder="Leave empty to use the built-in receptionist persona with the business context above."
              onChange={(e) => setS({ ...s, systemPrompt: e.target.value })} />
          </div>
          <button className="btn btn-primary" onClick={() => void mutate({ op: "settings.save", settings: s }, "Settings saved")}>Save settings</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div className="card-title">🔐 Environment (set in Vercel → Settings → Environment Variables)</div></div>
        <table className="tbl">
          <thead><tr><th>Variable</th><th>Purpose</th></tr></thead>
          <tbody>
            <tr><td className="mono">LLM_BASE_URL / LLM_API_KEY / LLM_MODEL</td><td>The brain — any OpenAI-compatible endpoint</td></tr>
            <tr><td className="mono">TWILIO_AUTH_TOKEN</td><td>Verifies every voice/SMS webhook signature</td></tr>
            <tr><td className="mono">HUMAN_FORWARD_NUMBER</td><td>Where &lt;Dial&gt; sends human hand-offs</td></tr>
            <tr><td className="mono">DEFAULT_ACTION</td><td>agent | human | block fallback (console override above)</td></tr>
            <tr><td className="mono">RESEND_API_KEY / EMAIL_FROM</td><td>Outbound email replies</td></tr>
            <tr><td className="mono">POSTGRES_URL</td><td>Persistent archive — without it memory resets on cold start</td></tr>
            <tr><td className="mono">ADMIN_TOKEN</td><td>Locks this console and mutating APIs</td></tr>
            <tr><td className="mono">RECORDING_ANNOUNCEMENT</td><td>“This call may be recorded” (on by default)</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
