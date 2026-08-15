import { createClient } from "@supabase/supabase-js";
import type { Database } from "@9thround/database-types";
import { env } from "../../../../src/lib/env";
import { errorResponse, verifyStaffAdmin } from "../../../../src/lib/verify-staff-admin";

/**
 * Activate/deactivate a staff account (docs/phase-1/17-audit-log-and-
 * permissions.md — "Data Safety": never delete a departed staff member's
 * identity, disable it instead, so their existing payments/memberships/
 * check-ins/audit log entries keep referencing their unchanged profile
 * id). Two things happen, deliberately, not one:
 *
 *   1. `profiles.is_active` is flipped — fast to query for the Manage
 *      Staff list, and feeds auth_role()/is_branch_staff() (defense in
 *      depth: RLS-gated access stops immediately even before/without a
 *      session expiring).
 *   2. Supabase Auth's own ban_duration is set/cleared via the Admin API
 *      — this is what actually makes *signing in* fail cleanly with a
 *      real error for a disabled account, instead of it still being able
 *      to log in and then silently seeing empty/blocked screens
 *      everywhere. `is_active` alone cannot do this — Supabase Auth has
 *      no knowledge of an app-level `profiles` column.
 *
 * The trigger-based audit log (log_profile_change(), 20260815000002_
 * permissions_and_staff_status.sql) deliberately stays silent for
 * service-role writes (no auth.uid()) — this route logs the change itself
 * via log_audit_event_as(), with the real acting admin's id already
 * known from verify-staff-admin.ts.
 */
export async function POST(request: Request) {
  const verified = await verifyStaffAdmin(request);
  if (verified instanceof Response) return verified;
  const { callerId, serviceRoleKey } = verified;

  let body: { profileId?: unknown; isActive?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_INPUT", "Malformed request body.", 400);
  }

  const profileId = typeof body.profileId === "string" ? body.profileId : "";
  const isActive = body.isActive === true;

  if (!profileId) {
    return errorResponse("INVALID_INPUT", "Select an employee.", 400);
  }
  if (profileId === callerId && !isActive) {
    return errorResponse("CANNOT_DISABLE_SELF", "You cannot deactivate your own account.", 400);
  }

  const adminClient = createClient<Database>(env.supabaseUrl ?? "", serviceRoleKey);

  const { error: banError } = await adminClient.auth.admin.updateUserById(profileId, {
    // "876000h" (100 years) is the conventional indefinite-ban duration
    // for Supabase Auth; "none" clears any existing ban.
    ban_duration: isActive ? "none" : "876000h",
  });
  if (banError) {
    return errorResponse("SET_ACTIVE_STATUS_FAILED", banError.message, 500);
  }

  const { error: updateError } = await adminClient.from("profiles").update({ is_active: isActive }).eq("id", profileId);
  if (updateError) {
    return errorResponse("SET_ACTIVE_STATUS_FAILED", updateError.message, 500);
  }

  await adminClient.rpc("log_audit_event_as", {
    p_actor_id: callerId,
    p_action: isActive ? "enable_user" : "disable_user",
    p_entity_type: "staff",
    p_entity_id: profileId,
    p_previous_value: { is_active: !isActive },
    p_new_value: { is_active: isActive },
  });

  return Response.json({ ok: true, isActive });
}
