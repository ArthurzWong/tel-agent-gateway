// Tel-Agent Gateway — Twilio signature verification.
// Every voice/SMS webhook validates X-Twilio-Signature when
// TWILIO_AUTH_TOKEN is configured; fakes are refused.

import { createHmac } from "crypto";
import { config } from "./config";

export function validTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  if (!config.twilio.authToken) return true; // unconfigured demo deployments accept; header noted in readiness
  if (!signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", config.twilio.authToken).update(Buffer.from(data, "utf-8")).digest("base64");
  return expected === signature;
}

export function twilioTwiML(xml: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${xml}`, {
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function sayXml(text: string, end = false): string {
  const say = `<Say language="${config.persona.language}">${escapeXml(text)}</Say>`;
  return end ? `<Response>${say}<Hangup/></Response>` : `<Response>${say}</Response>`;
}
