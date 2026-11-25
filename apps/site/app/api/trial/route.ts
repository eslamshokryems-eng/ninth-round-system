import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Public free-trial form → Sales CRM lead.
 *
 * Writes through the `submit_website_lead` Postgres function (Supabase RPC)
 * using the public anon key only — the leads table itself has no anonymous
 * policy, and no service-role key is used anywhere in the site. The function
 * validates again, de-duplicates by phone (24h) and enforces a global hourly
 * cap; this route adds the per-IP limit, a honeypot and a body-size guard.
 *
 * Env (server-only, set on the site's Vercel project):
 *   SUPABASE_URL       e.g. https://<ref>.supabase.co
 *   SUPABASE_ANON_KEY  the project's publishable/anon key
 * If either is missing the route answers 503 and the form falls back to
 * WhatsApp, so the page never breaks.
 */

const MAX_BODY_BYTES = 4_000;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;

// Best-effort per-instance limiter. Serverless instances don't share memory,
// so this only blunts naive floods; the DB-side caps are the real backstop.
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5_000) {
    for (const [key, times] of hits) {
      if (times.every((t) => now - t >= WINDOW_MS)) hits.delete(key);
    }
  }
  return recent.length > MAX_PER_WINDOW;
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ status: "invalid" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("shape");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  // Honeypot: real visitors never see this field. Pretend success to bots.
  if (str(body.company, 200) !== "") {
    return NextResponse.json({ status: "ok" });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ status: "rate_limited" }, { status: 429 });
  }

  const fullName = str(body.fullName, 100);
  const phone = str(body.phone, 30);
  const date = str(body.preferredDate, 10);
  const time = str(body.preferredTime, 5);
  if (fullName.length < 2 || !/^\+?[0-9]{8,15}$/.test(phone.replace(/[\s\-()]/g, ""))) {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  const utm: Record<string, string> = {};
  if (typeof body.utm === "object" && body.utm !== null) {
    for (const key of UTM_KEYS) {
      const value = str((body.utm as Record<string, unknown>)[key], 100);
      if (value) utm[key] = value;
    }
  }

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/submit_website_lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      body: JSON.stringify({
        p_full_name: fullName,
        p_phone: phone,
        p_program: str(body.program, 60) || null,
        p_preferred_date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
        p_preferred_time: /^\d{2}:\d{2}$/.test(time) ? time : null,
        p_notes: str(body.notes, 500) || null,
        p_utm: utm,
      }),
      cache: "no-store",
    });

    if (response.ok) {
      return NextResponse.json({ status: "ok" });
    }
    const error = (await response.json().catch(() => ({}))) as { message?: string };
    if (error.message === "invalid_name" || error.message === "invalid_phone") {
      return NextResponse.json({ status: "invalid" }, { status: 400 });
    }
    if (error.message === "rate_limited") {
      return NextResponse.json({ status: "rate_limited" }, { status: 429 });
    }
    return NextResponse.json({ status: "unavailable" }, { status: 502 });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 502 });
  }
}
