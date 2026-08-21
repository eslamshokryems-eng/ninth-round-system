import { createClient } from "@supabase/supabase-js";
import type { Database } from "@9thround/database-types";
import { env } from "../../../../src/lib/env";
import { errorResponse, verifyStaffAdmin } from "../../../../src/lib/verify-staff-admin";

/**
 * Delete Employee — Super Admin only (verifyStaffAdmin() alone allows
 * branch_manager too, so this route adds its own stricter check on top).
 *
 * Two steps: prepare_staff_deletion() (RPC, supabase/migrations/
 * 20260821000002_delete_staff_account.sql) clears "who did this" FK
 * references across the platform so no business record is destroyed or
 * blocks the deletion, then the Admin API removes the actual account —
 * the same "service_role key only inside a Route Handler" pattern already
 * used by /api/staff/create-account and /api/staff/set-password. Personal
 * HR records (attendance, shifts, leave, salary) cascade-delete on their
 * own via existing `on delete cascade` foreign keys to profiles.
 */
export async function POST(request: Request) {
  const verified = await verifyStaffAdmin(request);
  if (verified instanceof Response) return verified;
  const { actingRole, callerId, serviceRoleKey } = verified;

  if (!actingRole.isSuperAdmin()) {
    return errorResponse("FORBIDDEN_ROLE_ASSIGNMENT", "Only Super Admin can delete an employee account.", 403);
  }

  let body: { profileId?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_INPUT", "Malformed request body.", 400);
  }

  const profileId = typeof body.profileId === "string" ? body.profileId : "";
  if (!profileId) {
    return errorResponse("INVALID_INPUT", "Select an employee.", 400);
  }
  if (profileId === callerId) {
    return errorResponse("CANNOT_DELETE_SELF", "You cannot delete your own account.", 400);
  }

  const adminClient = createClient<Database>(env.supabaseUrl ?? "", serviceRoleKey);

  const { error: prepareError } = await adminClient.rpc("prepare_staff_deletion", { p_profile_id: profileId });
  if (prepareError) {
    return errorResponse("DELETE_EMPLOYEE_FAILED", prepareError.message, 500);
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(profileId);
  if (deleteError) {
    return errorResponse("DELETE_EMPLOYEE_FAILED", deleteError.message, 500);
  }

  return Response.json({ ok: true });
}
