import { NextResponse } from "next/server";
import { validateTrialForm, messages } from "@/lib/validation";
import type { TrialFormInput } from "@/lib/validation";
import { rateLimit, sweep } from "@/lib/rate-limit";
import { createWebsiteLead } from "@/lib/leads";

/**
 * PUBLIC trial-request endpoint. The ONLY server action the public site
 * performs. It inserts one row into the EXISTING `leads` table with
 * source = 'website'. It never reads any table, never returns a lead id,
 * and never exposes a database error.
 *
 * Runs on the Node.js runtime (needs the Supabase service-role client).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // widget not configured -> skip (honeypot + rate-limit still apply)
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip });
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
    });
    const json = (await res.json()) as { success?: boolean };
    return json.success === true;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  sweep();
  const ip = clientIp(req);

  // The visitor's language is not known until the body is parsed, so the
  // pre-parse messages fall back to the site default (Arabic).
  const limited = rateLimit(`trial:${ip}`);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, errors: { form: messages("ar").rateLimit } },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  let raw: Partial<TrialFormInput>;
  try {
    raw = (await req.json()) as Partial<TrialFormInput>;
  } catch {
    return NextResponse.json({ ok: false, errors: { form: messages("ar").invalid } }, { status: 400 });
  }

  const result = validateTrialForm(raw);
  if (!result.ok || !result.clean) {
    return NextResponse.json({ ok: false, errors: result.errors }, { status: 422 });
  }

  const humanVerified = await verifyTurnstile(raw.turnstileToken, ip);
  if (!humanVerified) {
    return NextResponse.json({ ok: false, errors: { form: messages(raw.lang).unverified } }, { status: 422 });
  }

  const insert = await createWebsiteLead(result.clean);

  if (!insert.ok) {
    // 503 => the client shows the WhatsApp fallback. No lead is lost.
    return NextResponse.json({ ok: false, reason: insert.reason }, { status: 503 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
