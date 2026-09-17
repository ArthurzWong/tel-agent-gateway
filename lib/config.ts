// Tel-Agent Gateway — configuration from environment variables only.
// No credential is ever hardcoded; everything is optional and the
// gateway degrades honestly (demo mode) when something is missing.

function env(key: string): string {
  const v = process.env[key];
  return typeof v === "string" ? v.trim() : "";
}

function envInt(key: string, fallback: number): number {
  const n = parseInt(env(key), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  llm: {
    provider: env("LLM_PROVIDER"),
    baseUrl: env("LLM_BASE_URL"),
    apiKey: env("LLM_API_KEY"),
    model: env("LLM_MODEL"),
  },
  persona: {
    name: env("AGENT_NAME") || "Tel-Agent",
    language: env("AGENT_LANGUAGE") || "en-US",
    greeting: env("GREETING"),
    businessContext: env("BUSINESS_CONTEXT"),
    systemPrompt: env("SYSTEM_PROMPT"),
  },
  routing: {
    defaultAction: (env("DEFAULT_ACTION") || "agent") as "agent" | "human" | "block",
    humanForwardNumber: env("HUMAN_FORWARD_NUMBER"),
    seedRules: env("ROUTING_RULES"),
    maxTurns: envInt("MAX_TURNS", 20),
  },
  twilio: {
    authToken: env("TWILIO_AUTH_TOKEN"),
    recordingAnnouncement: env("RECORDING_ANNOUNCEMENT") !== "false",
  },
  email: {
    resendApiKey: env("RESEND_API_KEY"),
    from: env("EMAIL_FROM"),
  },
  postgresUrl: env("POSTGRES_URL") || env("DATABASE_URL") || "",
  adminToken: env("ADMIN_TOKEN"),
};

/** Honest readiness report — what the dashboard shows. */
export function readiness() {
  const llmReady = Boolean(config.llm.apiKey && config.llm.baseUrl && config.llm.model);
  return {
    llm: llmReady,
    llmDetail: llmReady
      ? `${config.llm.provider || "openai-compatible"} · ${config.llm.model}`
      : "No LLM configured — the agent will say the model is not connected.",
    voice: Boolean(config.twilio.authToken) ? "Twilio voice webhooks active (signature verified)" : "Set TWILIO_AUTH_TOKEN to verify Twilio requests",
    emailOut: Boolean(config.email.resendApiKey) ? "Outbound email via Resend" : "Set RESEND_API_KEY to send email replies",
    forward: config.routing.humanForwardNumber ? `Human hand-off dials ${config.routing.humanForwardNumber}` : "Set HUMAN_FORWARD_NUMBER to enable <Dial> hand-off",
    storage: config.postgresUrl ? "Postgres (persistent)" : "In-memory (resets on cold start)",
    admin: config.adminToken ? "Console token required" : "ADMIN_TOKEN unset — mutating endpoints stay open (demo only)",
  };
}
