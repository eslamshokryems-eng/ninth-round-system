/**
 * Smart Reminders P3 — server-side Web Push dispatcher (used only by app/api/reminders/dispatch).
 * Claims due reminders in the database (FOR UPDATE SKIP LOCKED + lease), re-confirms each claim right before sending,
 * sends one notification per registered device and records the result. The payload never contains customer data:
 * only the follow-up kind, the minutes left and a link to the lead page, which itself requires sign-in + RLS.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ReminderClaim = {
  reminder_id: string;
  claim_token: string;
  lead_id: string;
  owner_id: string;
  due_at: string;
  kind: string | null;
  subscriptions: { endpoint: string; p256dh: string; auth: string }[];
};
export type DispatchSummary = { claimed: number; sent: number; retried: number; failed: number; stale: number; devicesRevoked: number };
export type PushSender = (sub: ReminderClaim["subscriptions"][number], payload: string, ttlSeconds: number) => Promise<number>;

const KIND_LABEL: Record<string, string> = { call: "Call", whatsapp: "WhatsApp", visit: "Gym visit", other: "Follow-up" };
const ALLOWED_HOSTS = new Set(["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);
const ALLOWED_SUFFIXES = [".push.apple.com", ".notify.windows.com", ".push.services.mozilla.com"];

/** Same rule as public.push_endpoint_allowed(): only real browser push services (no requests to internal hosts). */
export function isAllowedEndpoint(endpoint: string, allowLocalForTests = false): boolean {
  let url: URL;
  try { url = new URL(endpoint); } catch { return false; }
  if (allowLocalForTests && url.hostname === "127.0.0.1") return true; // local tests only (never in a production build)
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || endpoint.length > 1024) return false;
  return ALLOWED_HOSTS.has(url.hostname) || ALLOWED_SUFFIXES.some((s) => url.hostname.endsWith(s));
}

/** Constant-time comparison of the cron job's bearer secret. */
export function secretMatches(authorizationHeader: string | null, secret: string): boolean {
  const given = (authorizationHeader ?? "").replace(/^Bearer\s+/i, "");
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return given.length > 0 && timingSafeEqual(a, b);
}

/** Notification content: no customer name, no phone — kind + time + a link to the lead page. */
export function buildPayload(claim: Pick<ReminderClaim, "reminder_id" | "lead_id" | "due_at" | "kind">, now = Date.now()) {
  const minutes = Math.max(0, Math.round((Date.parse(claim.due_at) - now) / 60_000));
  const what = KIND_LABEL[claim.kind ?? ""] ?? "Follow-up";
  return {
    title: "9th Round · Follow-up reminder",
    body: minutes > 0 ? `${what} follow-up in ${minutes} min. Open the CRM for details.` : `${what} follow-up is due now. Open the CRM for details.`,
    url: `/sales/leads/${claim.lead_id}`,
    tag: `reminder-${claim.reminder_id}`,
  };
}

export function vapidSender(vapid: { publicKey: string; privateKey: string; subject: string }): PushSender {
  return async (sub, payload, ttlSeconds) => {
    try {
      const res = await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
        TTL: ttlSeconds, urgency: "high", timeout: 10_000, vapidDetails: vapid,
      });
      return res.statusCode;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      return typeof code === "number" ? code : 0; // 0 = network error / timeout (transient)
    }
  };
}

export async function dispatchDueReminders(
  db: SupabaseClient,
  send: PushSender,
  opts: { allowLocalEndpoints?: boolean; batchSize?: number; maxBatches?: number } = {},
): Promise<DispatchSummary> {
  const summary: DispatchSummary = { claimed: 0, sent: 0, retried: 0, failed: 0, stale: 0, devicesRevoked: 0 };
  for (let batch = 0; batch < (opts.maxBatches ?? 5); batch++) {
    const { data, error } = await db.rpc("claim_due_reminders", { p_limit: opts.batchSize ?? 50 });
    if (error) throw new Error(`claim failed: ${error.message}`);
    const claims = (data ?? []) as ReminderClaim[];
    if (claims.length === 0) break;
    summary.claimed += claims.length;
    for (const claim of claims) {
      // last check right before sending: never send for a rescheduled / cancelled / reassigned follow-up
      const { data: stillValid } = await db.rpc("confirm_reminder_claim", { p_reminder_id: claim.reminder_id, p_claim_token: claim.claim_token });
      if (stillValid !== true) { summary.stale++; continue; }
      const payload = JSON.stringify(buildPayload(claim));
      const ttl = Math.max(60, Math.round((Date.parse(claim.due_at) - Date.now()) / 1000));
      const ok: string[] = [], gone: string[] = [];
      let transient = false, lastCode = 0;
      await Promise.all(claim.subscriptions.map(async (sub) => {
        if (!isAllowedEndpoint(sub.endpoint, opts.allowLocalEndpoints)) { gone.push(sub.endpoint); return; }
        const code = await send(sub, payload, ttl);
        lastCode = code;
        if (code >= 200 && code < 300) ok.push(sub.endpoint);
        else if (code === 404 || code === 410) gone.push(sub.endpoint);
        else if (code === 0 || code === 429 || code >= 500) transient = true;
      }));
      const outcome = ok.length > 0 ? "sent" : transient ? "retry" : "failed";
      const reason = ok.length > 0 ? null : transient ? `push_transient_${lastCode}` : gone.length === claim.subscriptions.length ? "all_devices_gone" : `push_rejected_${lastCode}`;
      const { data: applied } = await db.rpc("complete_reminder_delivery", {
        p_reminder_id: claim.reminder_id, p_claim_token: claim.claim_token, p_outcome: outcome, p_error: reason, p_ok_endpoints: ok, p_gone_endpoints: gone,
      });
      summary.devicesRevoked += gone.length;
      if (applied !== true) summary.stale++;
      else if (outcome === "sent") summary.sent++;
      else if (outcome === "retry") summary.retried++;
      else summary.failed++;
    }
  }
  return summary;
}
