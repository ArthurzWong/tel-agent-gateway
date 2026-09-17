import { route } from "@/lib/routing";
import { config } from "@/lib/config";
import { openConversation, respond } from "@/lib/brain";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/email — inbound email webhook (SendGrid Inbound Parse,
 * Mailgun Routes, or any POST with from/subject/text fields).
 * Replies are sent through Resend when RESEND_API_KEY is set; otherwise
 * the reply is stored in the archive so you can see exactly what the
 * agent would have answered.
 */
export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") || "";
  let fields: Record<string, string> = {};

  if (contentType.includes("application/json")) {
    fields = (await req.json().catch(() => ({}))) as Record<string, string>;
  } else {
    const form = await req.formData();
    form.forEach((v, k) => { fields[k] = String(v); });
  }

  const from = fields.from || fields.sender || fields.From || "unknown";
  const subject = fields.subject || fields.Subject || "(no subject)";
  const text = fields.text || fields.body || fields["body-plain"] || fields.plain || "";

  // Extract a bare email address from "Name <addr@x>" forms.
  const addrMatch = from.match(/[\w.+-]+@[\w.-]+/);
  const replyTo = addrMatch ? addrMatch[0] : from;

  const decision = await route(from, "email");
  const store = getStore();

  if (decision.action === "block") {
    return Response.json({ ok: true, action: "blocked" });
  }

  const conv = await openConversation("email", from, fields.to || fields.To, { subject, rule: decision.rule?.id || "default" });
  const reply = text ? await respond(conv, `[Subject: ${subject}] ${text}`) : "Thanks for your email — how can we help?";

  if (decision.action === "human") {
    await store.closeConversation(conv.id, "Routed to a human before the agent answered.");
    return Response.json({ ok: true, action: "human" });
  }

  await store.closeConversation(conv.id);
  let sent = false;
  if (config.email.resendApiKey && addrMatch) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.email.resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: config.email.from || "Tel-Agent <onboarding@resend.dev>",
          to: [replyTo],
          subject: `Re: ${subject}`,
          text: reply,
        }),
      });
      sent = res.ok;
    } catch { sent = false; }
  }

  return Response.json({ ok: true, action: "agent", replySent: sent, reply });
}
