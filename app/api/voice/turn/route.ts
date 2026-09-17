import { route } from "@/lib/routing";
import { validTwilioSignature, twilioTwiML, escapeXml, sayXml } from "@/lib/twilio";
import { config } from "@/lib/config";
import { respond } from "@/lib/brain";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/voice/turn — one speech-recognition turn of a live call.
 * Twilio <Gather input="speech"> posts SpeechResult here; we generate the
 * reply with the brain and immediately gather again — a continuous loop
 * that feels like a real conversation. The caller can barge in because
 * each gather starts fresh as soon as the agent stops speaking.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => { params[k] = String(v); });

  const sig = req.headers.get("x-twilio-signature");
  if (!validTwilioSignature(url.toString(), params, sig)) {
    return twilioTwiML("<Response><Say>Goodbye.</Say><Hangup/></Response>");
  }

  const cid = url.searchParams.get("cid") || "";
  const turnsUsed = parseInt(url.searchParams.get("turns") || "1", 10) || 1;
  const store = getStore();
  const conv = cid ? await store.getConversation(cid) : null;

  const speech = (params.SpeechResult || "").trim();
  const digits = (params.Digits || "").trim();

  if (!conv) {
    return twilioTwiML(sayXml("Sorry, this call session has expired. Goodbye.", true));
  }

  // Caller said nothing
  if (!speech && !digits) {
    if (turnsUsed >= 2) {
      await store.closeConversation(conv.id, "No speech detected — call ended.");
      return twilioTwiML(sayXml("I didn't hear anything. Please call back anytime. Goodbye!", true));
    }
    return twilioTwiML(
      `<Response><Say language="${config.persona.language}">Are you still there?</Say>` +
      `<Redirect method="POST">${url.origin}/api/voice/turn?cid=${conv.id}&turns=${turnsUsed + 1}</Redirect></Response>`
    );
  }

  const callerText = speech || `Pressed ${digits}`;
  const reply = await respond(conv, callerText);

  // Safety valve: too many turns → take a message and end politely.
  if (turnsUsed >= config.routing.maxTurns) {
    await store.closeConversation(conv.id);
    return twilioTwiML(sayXml(`${reply} I've taken a note of everything we discussed. Someone will follow up. Goodbye!`, true));
  }

  // Hang up intent or human request at the tail of the conversation.
  const wantsHuman = /human|person|representative|agent|operator|speak to someone/i.test(callerText);
  if (wantsHuman && config.routing.humanForwardNumber) {
    await store.closeConversation(conv.id, "Caller asked for a human mid-call; warm transfer attempted.");
    return twilioTwiML(
      `<Response><Say language="${config.persona.language}">Of course, connecting you now.</Say>` +
      `<Dial timeout="25">${escapeXml(config.routing.humanForwardNumber)}</Dial></Response>`
    );
  }

  return twilioTwiML(
    `<Response><Say language="${config.persona.language}">${escapeXml(reply)}</Say>` +
    `<Redirect method="POST">${url.origin}/api/voice/turn?cid=${conv.id}&turns=${turnsUsed + 1}</Redirect></Response>`
  );
}
