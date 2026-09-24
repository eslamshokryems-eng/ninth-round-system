import { createClient } from "@supabase/supabase-js";
import type { Database } from "@9thround/database-types";
import { env } from "../../../../../../src/lib/env";
import { errorResponse } from "../../../../../../src/lib/verify-staff-admin";
import { verifyAuthenticatedUser } from "../../../../../../src/lib/verify-authenticated-user";

/**
 * Revokes every currently-active trusted device. Super Admin only. An
 * optional `userId` scopes this to one employee's devices instead of every
 * employee's — the Security page exposes both: a per-employee "revoke all
 * for this person" action and a single global "revoke all trusted
 * devices" button, per the approved design.
 */
export async function POST(request: Request) {
  const verified = await verifyAuthenticatedUser(request);
  if (verified instanceof Response) return verified;
  const { actingRole, callerId, serviceRoleKey } = verified;

  if (!actingRole.isSuperAdmin()) {
    return errorResponse("FORBIDDEN_ROLE_ASSIGNMENT", "Only Super Admin can revoke trusted devices.", 403);
  }

  let body: { userId?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const userId = typeof body.userId === "string" && body.userId ? body.userId : null;

  const adminClient = createClient<Database>(env.supabaseUrl ?? "", serviceRoleKey);

  let query = adminClient
    .from("trusted_devices")
    .update({ revoked_at: new Date().toISOString() })
    .is("revoked_at", null);
  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { error } = await query;
  if (error) {
    return errorResponse("REVOKE_ALL_FAILED", error.message, 500);
  }

  await adminClient.rpc("log_audit_event_as", {
    p_actor_id: callerId,
    p_action: "device_revoked_all",
    p_entity_type: "device",
    p_entity_id: userId ?? callerId,
    p_new_value: { scope: userId ? "single_user" : "all_users", user_id: userId },
  });

  return Response.json({ ok: true });
}
