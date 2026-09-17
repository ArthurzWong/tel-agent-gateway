import { openConversation, streamFor, sseHeaders } from "@/lib/brain";
import { getStore } from "@/lib/store";
import { route } from "@/lib/routing";

export const dynamic = "force-dynamic";

/**
 * POST /api/brain — streaming chat brain for the web widget / any client.
 * Body: { message, conversationId?, channel? }
 * Responds with SSE: { delta } chunks then a final { done, conversationId }.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    conversationId?: string;
    channel?: "chat" | "voice";
  };
  const message = (body.message || "").trim();
  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const store = getStore();
  let conv = body.conversationId ? await store.getConversation(body.conversationId) : null;
  if (!conv || conv.status === "closed") {
    const decision = await route("webchat", "chat");
    if (decision.action === "block") {
      return Response.json({ error: "blocked" }, { status: 403 });
    }
    conv = await openConversation("chat", "webchat", undefined, { rule: decision.rule?.id || "default" });
  }

  return new Response(streamFor(conv, message), { headers: sseHeaders() });
}
