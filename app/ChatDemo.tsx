"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "caller" | "agent"; text: string };

export default function ChatDemo({ status }: { status: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "agent", text: "Hello, you've reached the automated assistant. Ask me anything — this same brain also answers the phone, SMS and email." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [live, setLive] = useState<string>("");
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [msgs, live]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "caller", text }]);
    setBusy(true);
    setLive("…");
    try {
      const res = await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: convId }),
      });
      if (!res.ok || !res.body) throw new Error(String(res.status));
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
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
              if (j.delta) {
                acc += j.delta;
                setLive(acc);
              }
              if (j.done && j.conversationId) setConvId(j.conversationId);
            } catch { /* partial */ }
          }
        }
      }
      if (acc) setMsgs((m) => [...m, { role: "agent", text: acc }]);
    } catch {
      setMsgs((m) => [...m, { role: "agent", text: "(connection error — the gateway did not respond)" }]);
    } finally {
      setLive("");
      setBusy(false);
    }
  }

  return (
    <div className="chat-card">
      <div className="chat-head">
        <div className="chat-head-title">📞 Live agent demo <span className={`chat-status ${status === "connected" ? "on" : ""}`}>● {status}</span></div>
        <div className="chat-status">{convId ? `session ${convId.slice(0, 8)}` : "new session"}</div>
      </div>
      <div className="chat-body" ref={bodyRef}>
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>{m.text}</div>
        ))}
        {live && <div className="msg agent typing">{live}</div>}
      </div>
      <div className="chat-input">
        <input
          value={input}
          placeholder={busy ? "The agent is replying…" : "Type a message and press Enter…"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          disabled={busy}
        />
        <button onClick={send} disabled={busy || !input.trim()}>Send</button>
      </div>
      <div className="chat-note">POST /api/brain · SSE streaming · same brain as voice/SMS/email</div>
    </div>
  );
}
