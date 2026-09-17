import { route } from "@/lib/routing";
import { validTwilioSignature, twilioTwiML } from "@/lib/twilio";
import { openConversation, respond } from "@/lib/brain";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** POST /api/sms — Twilio inbound SMS webhook. Same brain, text channel. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  const sig = req.headers.get("x-twilio-signature");
  if (!validTwilioSignature(url.toString(), params, sig)) {
    return twilioTwiML("<Response></Response>");
  }

  const from = params.From || "unknown";
  const body = (params.Body || "").trim();
  const decision = await route(from, "sms");
  const store = getStore();

  if (decision.action === "block") {
    return twilioTwiML("<Response></Response>");
  }
  if (decision.action === "human") {
    const conv = await openConversation("sms", from, params.To, { rule: decision.rule?.id || "", outcome: "human" });
    await store.closeConversation(conv.id, "Routed to a human before the agent answered.");
    const note = configHumanNote();
    return twilioTwiML(`<Response><Message>${escape(note)}</Message></Response>`);
  }

  const conv = await openConversation("sms", from, params.To, { callSid: params.SmsSid || "" });
  const reply = body ? await respond(conv, body) : "Hi! You reached the automated assistant — how can I help?";
  if (body) await store.closeConversation(conv.id);

  return twilioTwiML(`<Response><Message>${escape(reply)}</Message></Response>`);
}

function configHumanNote(): string {
  return "Thanks for your message — a member of our team will get back to you shortly.";
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
