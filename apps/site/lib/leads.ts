import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * SERVER ONLY. The one place the public site talks to Supabase.
 *
 * It performs a single action: INSERT one row into the EXISTING `leads`
 * table with source = 'website'. It never reads members, staff, CRM notes,
 * or any other table. The `service_role` key is read from a server-only
 * env var and is never bundled to the browser (the `server-only` import
 * above makes a client import a build error).
 *
 * No schema change: trial preferences are packed into `interest_notes`
 * (Safety Audit decision D6, option A). `lead_source` already includes
 * 'website' in the existing enum.
 */

export type LeadInsertResult =
  | { ok: true }
  | { ok: false; reason: "not_configured" | "insert_failed" };

interface LeadPayload {
  fullName: string;
  phone: string;
  email: string | null;
  gender: "female" | "male" | "unspecified" | null;
  interestNotes: string;
}

export async function createWebsiteLead(payload: LeadPayload): Promise<LeadInsertResult> {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const branchId = process.env.NINTH_ROUND_DEFAULT_BRANCH_ID;

  if (!url || !serviceRoleKey || !branchId) {
    // Not wired yet (e.g. local dev without secrets). The caller falls
    // back to showing the WhatsApp option — no lead is silently lost.
    return { ok: false, reason: "not_configured" };
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await admin.from("leads").insert({
    branch_id: branchId,
    full_name: payload.fullName,
    phone: payload.phone,
    email: payload.email,
    gender: payload.gender,
    source: "website",
    status: "new",
    assigned_to: null,
    interest_notes: payload.interestNotes,
    // created_by is a nullable FK to profiles(id); a website lead has no
    // staff author, so it is left null.
  });

  if (error) {
    // Do not surface DB detail to the client.
    console.error("[site] lead insert failed:", error.message);
    return { ok: false, reason: "insert_failed" };
  }

  return { ok: true };
}
