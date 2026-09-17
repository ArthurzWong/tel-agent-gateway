import { getStore } from "@/lib/store";
import { readiness } from "@/lib/config";

export const dynamic = "force-dynamic";

/** GET /api/health — readiness probe for Vercel uptime checks. */
export async function GET() {
  const store = getStore();
  let db = false;
  try { db = await store.ping(); } catch { db = false; }
  return Response.json({
    ok: true,
    service: "tel-agent-gateway",
    storage: store.mode(),
    db,
    readiness: readiness(),
    at: new Date().toISOString(),
  });
}
