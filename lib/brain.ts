// Tel-Agent Gateway — brain API. One brain, four channels.

import type { Channel, Conversation, Message } from "@/lib/store";
import { getStore } from "@/lib/store";
import { completeReply, llmReady, resolveSystemPrompt, streamReply, type Turn } from "@/lib/llm";
import { config } from "@/lib/config";

export async function openConversation(channel: Channel, from: string, to?: string, meta?: Record<string, string>): Promise<Conversation> {
  const store = getStore();
  const now = new Date().toISOString();
  const conv: Conversation = { id: crypto.randomUUID(), channel, from, to, status: "active", startedAt: now, updatedAt: now, messages: [], meta };
  await store.upsertConversation(conv);
  return conv;
}

export async function historyToTurns(conv: Conversation): Promise<Turn[]> {
  const turns: Turn[] = [{ role: "system", content: await resolveSystemPrompt(new Date(), conv.channel) }];
  for (const m of conv.messages.slice(-20)) {
    if (m.role === "caller") turns.push({ role: "user", content: m.text });
    else if (m.role === "agent") turns.push({ role: "assistant", content: m.text });
  }
  return turns;
}

/** Record the caller's utterance and generate the agent reply. */
export async function respond(conv: Conversation, callerText: string): Promise<string> {
  const store = getStore();
  const msg: Message = { role: "caller", text: callerText, at: new Date().toISOString() };
  conv.messages.push(msg);

  const reply = await completeReply(await historyToTurns(conv));

  const amsg: Message = { role: "agent", text: reply, at: new Date().toISOString() };
  conv.messages.push(amsg);
  await store.upsertConversation({ ...conv, updatedAt: amsg.at });
  return reply;
}

/** Streaming variant for web chat / live calls: persists the same way. */
export function streamFor(conv: Conversation, callerText: string) {
  const store = getStore();
  const msg: Message = { role: "caller", text: callerText, at: new Date().toISOString() };
  conv.messages.push(msg);

  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        full = await streamReply(await historyToTurns(conv), (chunk) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk })}\n\n`));
        });
      } catch {
        full = full || "Sorry, something went wrong on my side.";
      }
      const amsg: Message = { role: "agent", text: full, at: new Date().toISOString() };
      conv.messages.push(amsg);
      await store.upsertConversation({ ...conv, updatedAt: amsg.at });
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, conversationId: conv.id, llmReady: llmReady() })}\n\n`));
      controller.close();
    },
  });
}

export function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
}

export { config };
