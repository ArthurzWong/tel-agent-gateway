import { route } from "@/lib/routing";
import { validTwilioSignature, twilioTwiML, escapeXml, sayXml } from "@/lib/twilio";
import { config } from "@/lib/config";
import { openConversation, respond } from "@/lib/brain";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/voice — Twilio Programmable Voice webhook for inbound calls.
 *
 * Flow: caller ID is checked against routing rules.
 *   block → <Reject>
 *   human → <Dial> HUMAN_FORWARD_NUMBER (falls back to voicemail-ish message if unset)
 *   agent → the agent answers with a greeting, then loops through
 *           /api/voice/turn (speech gather) until the caller hangs up
 *           or MAX_TURNS is reached (then it takes a message / ends politely).
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  const sig = req.headers.get("x-twilio-signature");
  if (!validTwilioSignature(url.toString(), params, sig)) {
    return twilioTwiML("<Response><Reject/></Response>");
  }

  const from = params.From || "unknown";
  const callSid = params.CallSid || crypto.randomUUID();
  const decision = await route(from, "voice");

  if (decision.action === "block") {
    return twilioTwiML("<Response><Reject/></Response>");
  }

  if (decision.action === "human") {
    const store = getStore();
    const conv = await openConversation("voice", from, params.To, { callSid, rule: decision.rule?.id || "", outcome: "human" });
    await store.closeConversation(conv.id, "Routed to a human before the agent answered.");
    if (config.routing.humanForwardNumber) {
      return twilioTwiML(
        `<Response><Dial timeout="25">${escapeXml(config.routing.humanForwardNumber)}</Dial></Response>`
      );
    }
    return twilioTwiML(
      sayXml("I'm transferring you to a person. Please hold.", true)
    );
  }

  // agent answers
  const conv = await openConversation("voice", from, params.To, { callSid, rule: decision.rule?.id || "default" });
  const greeting =
    config.twilio.recordingAnnouncement
      ? "Hello, you've reached the automated assistant. This call may be recorded. How can I help you today?"
      : "Hello, you've reached the automated assistant. How can I help you today?";

  const amsg = { role: "agent" as const, text: greeting, at: new Date().toISOString() };
  conv.messages.push(amsg);
  await getStore().upsertConversation(conv);

  return twilioTwiML(
    `<Response>${`<Say language="${config.persona.language}">${escapeXml(greeting)}</Say>`}` +
    `<Redirect method="POST">${url.origin}/api/voice/turn?cid=${conv.id}&turns=1</Redirect></Response>`
  );
}
