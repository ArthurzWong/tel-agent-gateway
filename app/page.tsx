import Link from "next/link";
import ChatDemo from "./ChatDemo";
import { readiness } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function Home() {
  const r = readiness();
  const status = r.llm ? "connected" : "demo mode";

  return (
    <>
      <nav className="nav">
        <Link href="/" className="nav-brand"><span className="brand-mark">☏</span> Tel-Agent</Link>
        <div className="nav-links">
          <a href="#how">How it works</a>
          <a href="#channels">Channels</a>
          <a href="#quickstart">Quickstart</a>
          <Link href="/console" className="nav-cta">Open Console</Link>
        </div>
      </nav>

      <header className="hero container">
        <div className="hero-grid">
          <div>
            <div className="eyebrow"><span className="dot" /> Self-hosted · Bring your own keys</div>
            <h1>A phone call lands.<br /><span className="accent">An AI picks up.</span></h1>
            <p className="hero-sub">
              Tel-Agent is an open-source gateway that connects <strong>any phone line to any large language
              model you choose</strong>. It sits right in front of your existing phone system and decides
              exactly who talks to a person and who talks to an agent. It runs on your infrastructure, so you
              keep full control of your data, your recordings, and your privacy.
            </p>
            <div className="hero-actions">
              <Link href="/console" className="btn btn-primary">Open the Console →</Link>
              <a href="#quickstart" className="btn btn-ghost">Deploy in 5 minutes</a>
            </div>
          </div>
          <ChatDemo status={status} />
        </div>
      </header>

      <section className="section" id="how">
        <div className="container">
          <div className="section-head">
            <div className="section-kicker">The pipeline</div>
            <h2>Call → Route → Think → Speak</h2>
            <p className="section-sub">
              Every inbound contact flows through the same four stages. The routing engine is yours:
              rules by number, prefix, sender or channel decide who ever reaches the AI at all.
            </p>
          </div>
          <div className="flow">
            <div className="flow-step">
              <div className="num">01 · CONNECT</div>
              <h3>A call lands</h3>
              <p>Your carrier or PBX forwards the call to the gateway webhook. Same entry point for voice, SMS, email and chat.</p>
            </div>
            <div className="flow-step">
              <div className="num">02 · ROUTE</div>
              <h3>Rules decide</h3>
              <p>Priority-ordered rules match the caller ID or sender. Agent, human, or block — the first match wins, the default covers the rest.</p>
            </div>
            <div className="flow-step">
              <div className="num">03 · THINK</div>
              <h3>One brain</h3>
              <p>Any OpenAI-compatible model — OpenAI, Groq, DeepSeek, OpenRouter, or your own Ollama box. Swap the brain by changing one env var.</p>
            </div>
            <div className="flow-step">
              <div className="num">04 · SPEAK</div>
              <h3>Real-time reply</h3>
              <p>Streaming text-to-speech answers the caller live, handles interruptions, and every turn is transcribed and archived.</p>
            </div>
          </div>

          <div className="decision">
            <div className="decision-card">
              <span className="tag tag-agent">→ AGENT</span>
              <h3>AI answers in real time</h3>
              <p>Greets, answers questions, takes messages, and hands over the moment a caller insists on a person.</p>
            </div>
            <div className="decision-card">
              <span className="tag tag-human">→ HUMAN</span>
              <h3>Straight to your team</h3>
              <p>VIPs, existing clients, or business hours — the gateway dials your real number before the AI ever speaks.</p>
            </div>
            <div className="decision-card">
              <span className="tag tag-block">→ BLOCK</span>
              <h3>Nobody has time for that</h3>
              <p>Spam and nuisance callers are rejected at the front door. They never ring, never cost minutes.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="channels">
        <div className="container">
          <div className="section-head">
            <div className="section-kicker">Channels</div>
            <h2>Phone first. Texts, email and chat through the same brain.</h2>
            <p className="section-sub">One conversation history per contact, whichever door they knock on.</p>
          </div>
          <div className="channels">
            <div className="channel"><span className="ico">📞</span><div><div className="name">Voice calls</div><div className="state">● live · Twilio / SIP</div></div></div>
            <div className="channel"><span className="ico">💬</span><div><div className="name">SMS</div><div className="state">● live · two-way</div></div></div>
            <div className="channel"><span className="ico">✉️</span><div><div className="name">Email</div><div className="state">● inbound parse + reply</div></div></div>
            <div className="channel"><span className="ico">🖥️</span><div><div className="name">Web chat</div><div className="state">● SSE streaming</div></div></div>
            <div className="channel"><span className="ico">🌐</span><div><div className="name">Browser call</div><div className="state">● mic → agent in-console</div></div></div>
            <div className="channel"><span className="ico">🔀</span><div><div className="name">Human transfer</div><div className="state">● warm hand-off</div></div></div>
            <div className="channel"><span className="ico">📇</span><div><div className="name">Transcript archive</div><div className="state">● searchable</div></div></div>
            <div className="channel"><span className="ico">🧩</span><div><div className="name">REST API</div><div className="state">● /api/brain for anything</div></div></div>
          </div>

          <div className="feature-grid" style={{ marginTop: "18px" }}>
            <div className="feature">
              <div className="ico">🔐</div>
              <h3>Your hardware, your keys</h3>
              <p>Model keys live in your environment, never in a shared app. Recordings and transcripts stay in your own database.</p>
            </div>
            <div className="feature">
              <div className="ico">🧠</div>
              <h3>Model-agnostic</h3>
              <p>OpenAI-compatible protocol means OpenAI, Groq, DeepSeek, OpenRouter, Together, vLLM, Ollama, LM Studio — anything.</p>
            </div>
            <div className="feature">
              <div className="ico">🛡️</div>
              <h3>Hardened webhooks</h3>
              <p>Twilio signature verification, admin-token-guarded console, request ceilings, and honest demo mode when keys are missing.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="quickstart">
        <div className="container">
          <div className="section-head">
            <div className="section-kicker">Quickstart</div>
            <h2>Own your phone line in five minutes</h2>
          </div>
          <div className="codeblock">
            <div className="codeblock-head"><span>terminal</span><span>vercel + twilio + any llm</span></div>
            <pre>
<span className="cm"># 1 — clone &amp; configure</span>{"\n"}
git clone https://github.com/<span className="kw">ArthurzWong</span>/Tel-Agent gateway{"\n"}
cd gateway &amp;&amp; cp .env.example .env.local{"\n\n"}
<span className="cm"># 2 — point it at your model + Twilio credentials</span>{"\n"}
<span className="cm">#    (LLM_BASE_URL works with OpenAI, Groq, DeepSeek, Ollama…)</span>{"\n\n"}
<span className="cm"># 3 — deploy</span>{"\n"}
vercel --prod{"\n\n"}
<span className="cm"># 4 — buy a number in Twilio, set its voice webhook to:</span>{"\n"}
https://your-app.vercel.app/<span className="kw">api/voice</span>{"\n"}
<span className="cm">#    …and messaging webhook to /api/sms. Call it. Talk to it.</span>
            </pre>
          </div>
        </div>
      </section>

      <footer>
        <div className="container">
          <div>Tel-Agent Gateway — open source, AGPL-friendly concept build. Reference: github.com/ArthurzWong/Tel-Agent</div>
          <div><a href="/api/health">/api/health</a> · <Link href="/console">Console</Link></div>
        </div>
      </footer>
    </>
  );
}
