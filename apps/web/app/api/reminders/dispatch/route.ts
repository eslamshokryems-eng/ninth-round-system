import { createClient } from "@supabase/supabase-js";
import { env } from "../../../../src/lib/env";
import { dispatchDueReminders, secretMatches, vapidSender } from "../../../../src/lib/reminders/dispatch";

/**
 * Smart Reminders dispatcher. Called every minute by the database scheduler (pg_cron + pg_net, see
 * supabase/setup/sales_reminders_cron.sql) with `Authorization: Bearer <REMINDER_DISPATCH_SECRET>`, only when reminders are due.
 * Returns counts only — never reminder, lead or customer data.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = process.env.REMINDER_DISPATCH_SECRET ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapid = {
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    privateKey: process.env.VAPID_PRIVATE_KEY ?? "",
    subject: process.env.VAPID_SUBJECT ?? "",
  };
  if (secret.length < 32 || !serviceRoleKey || !env.supabaseUrl || !vapid.publicKey || !vapid.privateKey || !vapid.subject) {
    return Response.json({ error: "REMINDERS_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!secretMatches(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const db = createClient(env.supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const summary = await dispatchDueReminders(db, vapidSender(vapid), {
      allowLocalEndpoints: process.env.NODE_ENV !== "production" && process.env.REMINDER_PUSH_ALLOW_LOCAL === "1",
    });
    return Response.json(summary);
  } catch {
    return Response.json({ error: "DISPATCH_FAILED" }, { status: 500 });
  }
}
