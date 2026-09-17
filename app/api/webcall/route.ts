import { config } from "@/lib/config";
import { route } from "@/lib/routing";
import { openConversation } from "@/lib/brain";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * POST /api/webcall?u=<browser>|<phone> — creates the conversation shell for
 * a browser-based call and returns the TwiML app callback contract.
 *
 * Realtime browser↔agent audio (mic → STT → brain → TTS) is wired client-side
 * on the Console "Live call" tab using WebRTC when a realtime speech model is
 * configured; this endpoint is the session factory both paths share.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const u = url.searchParams.get("u") || "browser";
  const decision = await route(u === "browser" ? "webcall" : u, "voice");

  if (decision.action === "block") {
    return Response.json({ error: "blocked" }, { status: 403 });
  }

  const store = getStore();
  const conv = await openConversation("voice", u === "browser" ? "browser-call" : u, undefined, {
    rule: decision.rule?.id || "default",
    transport: "webcall",
  });

  const greeting =
    config.twilio.recordingAnnouncement
      ? "Hello, you're through to the automated assistant. This call may be recorded. How can I help?"
      : "Hello, you're through to the automated assistant. How can I help?";

  const amsg = { role: "agent" as const, text: greeting, at: new Date().toISOString() };
  conv.messages.push(amsg);
  await store.upsertConversation(conv);

  return Response.json({
    conversationId: conv.id,
    action: decision.action,
    greeting,
    llmConfigured: Boolean(config.llm.apiKey),
    humanForward: config.routing.humanForwardNumber || null,
  });
}
