import { createClient } from "@supabase/supabase-js";
import type { Database } from "@9thround/database-types";
import { env } from "../../../../src/lib/env";
import { errorResponse, verifyStaffAdmin } from "../../../../src/lib/verify-staff-admin";

/**
 * Step 2 of "Add Employee" (docs/phase-1/16-employee-login.md) — the
 * account created in step 1 has only a random, never-shown placeholder
 * password; this is what actually makes it usable, by replacing it with a
 * real one an admin sets and hands to the employee along with their
 * Employee ID.
 */
export async function POST(request: Request) {
  const verified = await verifyStaffAdmin(request);
  if (verified instanceof Response) return verified;
  const { callerId, serviceRoleKey } = verified;

  let body: { profileId?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_INPUT", "Malformed request body.", 400);
  }

  const profileId = typeof body.profileId === "string" ? body.profileId : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!profileId) {
    return errorResponse("INVALID_INPUT", "Select an employee.", 400);
  }
  if (password.length < 6) {
    return errorResponse("INVALID_PASSWORD", "Password must be at least 6 characters.", 400);
  }

  const adminClient = createClient<Database>(env.supabaseUrl ?? "", serviceRoleKey);
  const { error } = await adminClient.auth.admin.updateUserById(profileId, { password });
  if (error) {
    return errorResponse("ACCOUNT_CREATE_FAILED", error.message, 500);
  }

  await adminClient.rpc("log_audit_event_as", {
    p_actor_id: callerId,
    p_action: "password_reset",
    p_entity_type: "staff",
    p_entity_id: profileId,
  });

  return Response.json({ ok: true });
}
