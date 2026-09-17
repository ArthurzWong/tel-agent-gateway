# Tel-Agent Gateway

**A phone call lands on your server, and instead of a human picking up, an AI answers it — in real time.**

Tel-Agent Gateway is an open-source gateway that connects **any phone line to any large language
model you choose**. It sits right in front of your existing phone system and decides exactly who
talks to a person and who talks to an agent. It also handles **texts, email, and web chat through
the same brain**. Because it runs on your own infrastructure with your own keys, you keep full
control of your data, your recordings, and your privacy.

> Concept build inspired by [ArthurzWong/Tel-Agent](https://github.com/ArthurzWong/Tel-Agent)
> (self-hosted Python/LiveKit stack), re-implemented as a serverless Next.js app that deploys to
> **Vercel** in one command.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FArthurzWong%2Ftel-agent-gateway&env=LLM_API_KEY,LLM_BASE_URL,LLM_MODEL,TWILIO_AUTH_TOKEN,HUMAN_FORWARD_NUMBER,ADMIN_TOKEN,POSTGRES_URL)

---

## How it works

```
Caller ──▶ Carrier/PBX ──▶ Twilio ──▶ POST /api/voice ─┐
Texter ──▶ SMS number ─────▶ POST /api/sms ────────────┤
Mail   ──▶ Inbound Parse ──▶ POST /api/email ──────────┼──▶ Routing engine ──▶ ┌ agent → LLM brain ─▶ reply
Viewer ──▶ Web chat ────────▶ POST /api/brain ─────────┘       (rules +        ├ human → <Dial> your number
                                                                default)        └ block → <Reject>
```

1. **Connect** — every channel lands on one webhook per channel.
2. **Route** — priority-ordered rules match the caller ID / sender: `agent`, `human`, or `block`.
   First match wins; everything else falls to `DEFAULT_ACTION`.
3. **Think** — one brain, any OpenAI-compatible API: OpenAI, Groq, DeepSeek, OpenRouter, Together,
   vLLM, **Ollama / LM Studio on your own box** (point `LLM_BASE_URL` at it).
4. **Speak** — voice calls use Twilio speech gather in a continuous turn loop; replies stream token
   by token; callers can request a human mid-call and get a warm `<Dial>` hand-off.

## Channels

| Channel | Endpoint | Provider wiring |
|---|---|---|
| Voice calls | `POST /api/voice` (+ `/api/voice/turn`) | Twilio number → "A call comes in" webhook |
| SMS | `POST /api/sms` | Twilio number → "A message comes in" webhook |
| Email | `POST /api/email` | SendGrid Inbound Parse / Mailgun route → the URL; replies via Resend |
| Web chat | `POST /api/brain` (SSE) | Any client; built into the landing page |
| Browser call | Console → "Live call" | Mic → browser STT → same brain (great for testing) |
| Ops | `GET /api/health` | Uptime probe |

## Quick start (local)

```bash
npm install
cp .env.example .env.local   # add at least an LLM key
npm run dev                  # http://localhost:3000
```

Open the site, try the live demo chat, then open **/console** to see the conversation appear in the
archive, edit routing rules, and place a live browser call.

## Deploy to Vercel

```bash
npm i -g vercel
vercel            # link the project
vercel --prod     # ship it
```

Then in **Vercel → Settings → Environment Variables** add (all optional — see honest demo mode):

| Variable | Purpose |
|---|---|
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | The brain. Any OpenAI-compatible endpoint. |
| `TWILIO_AUTH_TOKEN` | Verifies `X-Twilio-Signature` on every voice/SMS webhook. Strongly recommended. |
| `HUMAN_FORWARD_NUMBER` | E.164 number that `<Dial>` rings for human hand-off. |
| `DEFAULT_ACTION` | `agent` (default) / `human` / `block` for unmatched contacts. |
| `ROUTING_RULES` | Optional JSON seed rules (the Console manages rules at runtime). |
| `RESEND_API_KEY` / `EMAIL_FROM` | Outbound email replies. |
| `POSTGRES_URL` | Persistent archive (Vercel Postgres / Neon / Supabase). Without it, state is in-memory and resets on cold start. |
| `ADMIN_TOKEN` | Locks the console + mutating APIs. |
| `AGENT_NAME` / `AGENT_LANGUAGE` / `BUSINESS_CONTEXT` | Persona defaults (Console overrides). |
| `RECORDING_ANNOUNCEMENT` | "This call may be recorded" — on by default. |
| `MAX_TURNS` | Safety valve that ends very long calls politely (default 20). |

Finally, buy a number in Twilio and point its **voice webhook** at `https://your-app.vercel.app/api/voice`
and its **messaging webhook** at `/api/sms`. Call it. Talk to it.

## The Console (`/console`)

- **Overview** — deployment readiness: what's wired, what's missing, webhook endpoints to configure.
- **Conversations** — full archive across all channels; click through to the complete transcript.
- **Routing** — add/edit/delete priority rules: pattern, match type, channel, action.
- **Live call** — call the agent from the browser: mic capture, live VU meter, speech-to-text,
  spoken replies, full transcript — exactly what a phone caller experiences.
- **Settings** — default action, business context, full system prompt override (stored in the
  database, overrides env).

## Security notes

- Twilio webhooks verify `X-Twilio-Signature` when `TWILIO_AUTH_TOKEN` is set.
- `ADMIN_TOKEN` guards the console and every mutating API call.
- No credential is ever hardcoded; configuration is environment-only.
- Recording announcement is on by default (two-party consent jurisdictions).
- Honest demo mode: with no keys, the agent says the model isn't connected instead of crashing —
  and the readiness panel tells you exactly what to add.

## What this is / isn't

- **Is:** a lightweight, serverless gateway + ops console: routing, one brain, transcripts, all channels.
- **Isn't (yet):** a full PBX, and it doesn't stream raw RTP audio — voice audio flows through
  Twilio's speech recognition/synthesis. For SIP trunking, LiveKit media streaming, call recordings
  on your own disk, and tool-calling workflows, see the upstream
  [Tel-Agent](https://github.com/ArthurzWong/Tel-Agent) self-hosted stack — the two share the same
  concepts and can run side by side.

## License

AGPL-3.0 — same spirit as the upstream project. © Concept build 2026.
