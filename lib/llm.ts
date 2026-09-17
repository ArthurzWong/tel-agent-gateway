// Tel-Agent Gateway — the brain.
// Any OpenAI-compatible chat completions endpoint works: OpenAI, Groq,
// DeepSeek, OpenRouter, Together, or your own Ollama/LM Studio box —
// just point LLM_BASE_URL at it. Streaming keeps first-token latency low
// enough for voice.

import { config } from "./config";
import { getStore } from "./store";

export type Turn = { role: "system" | "user" | "assistant"; content: string };

export function llmReady(): boolean {
  return Boolean(config.llm.apiKey && config.llm.baseUrl && config.llm.model);
}

/** Default persona generated from env when the console hasn't set its own. */
export function systemPrompt(now: Date, channel: string): string {
  const p = config.persona;
  const lines = [
    `You are ${p.name}, the AI receptionist for this organisation. You are speaking on ${channel}.`,
    `Today is ${now.toISOString()}. Respond in ${p.language}.`,
    "Speak naturally and briefly — this is a live conversation, not an essay. One or two sentences per reply unless asked for detail.",
    "You can take messages, answer questions about the business, and politely handle spam.",
    "If a caller insists on a human, asks for something you cannot do, or the conversation is going in circles, say you will hand them over or take a message — do not invent facts.",
    p.businessContext ? `Business context: ${p.businessContext}` : "",
  ].filter(Boolean);
  return lines.join(" ");
}

/** Console settings win over env; env wins over the generated default. */
export async function resolveSystemPrompt(now: Date, channel: string): Promise<string> {
  try {
    const s = await getStore().getSettings();
    if (s.systemPrompt && s.systemPrompt.trim()) return s.systemPrompt;
  } catch { /* settings unavailable — fall through */ }
  return systemPrompt(now, channel);
}

/**
 * Streams a reply. Yields text chunks as they arrive so a voice transport
 * can start speaking the first sentence while the rest generates.
 */
export async function streamReply(
  turns: Turn[],
  onChunk: (text: string) => void | Promise<void>
): Promise<string> {
  if (!llmReady()) {
    const msg =
      "I'm the receptionist, but the language model isn't connected on this deployment yet. " +
      "Your message has been recorded and someone will get back to you.";
    await onChunk(msg);
    return msg;
  }

  const url = `${config.llm.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  let full = "";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify({
        model: config.llm.model,
        messages: turns,
        stream: true,
        temperature: 0.6,
        max_tokens: 400,
      }),
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new Error(`LLM ${res.status}: ${detail.slice(0, 200)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const events = buf.split("\n\n");
      buf = events.pop() || "";
      for (const ev of events) {
        for (const line of ev.split("\n")) {
          const t = line.trim();
          if (!t.startsWith("data:")) continue;
          const data = t.slice(5).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data) as {
              choices?: { delta?: { content?: string } }[];
            };
            const piece = json.choices?.[0]?.delta?.content || "";
            if (piece) {
              full += piece;
              await onChunk(piece);
            }
          } catch { /* partial JSON — keep buffering */ }
        }
      }
    }
  } catch {
    const fallback =
      full ||
      "Sorry — I'm having technical trouble reaching the model right now. Please try again in a moment, or leave a message and we'll call you back.";
    if (!full) await onChunk(fallback);
    return fallback;
  }
  return full;
}

/** Non-streaming helper for SMS/email where the whole reply lands at once. */
export async function completeReply(turns: Turn[]): Promise<string> {
  return streamReply(turns, () => {});
}
