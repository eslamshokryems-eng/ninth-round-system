import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@9thround/database-types";
import { USER_ROLES, type UserRoleName } from "@9thround/identity";
import { env } from "../../../../src/lib/env";
import { errorResponse, verifyStaffAdmin } from "../../../../src/lib/verify-staff-admin";

/**
 * `SUPABASE_SERVICE_ROLE_KEY` (read in verify-staff-admin.ts, never
 * exposed to the browser — see that file's own comment) is what lets this
 * route use the Admin API below. Route Handlers run on the server only;
 * this file is never sent to the browser. See docs/13-ddd-architecture.md.
 *
 * Step 1 of 2 of "Add Employee" (docs/phase-1/16-employee-login.md): takes
 * just name/phone/address/role — no email, no password, matching the HR
 * spec that Add Employee shouldn't ask for either. Generates a real
 * Employee ID (next_employee_code()) and creates the auth account behind a
 * synthetic email + a random, never-shown, never-usable placeholder
 * password — the account exists (so it can be assigned shifts/leave/
 * salary right away) but genuinely cannot be logged into until Set
 * Password (step 2, /api/staff/set-password) runs.
 */
export async function POST(request: Request) {
  const verified = await verifyStaffAdmin(request);
  if (verified instanceof Response) return verified;
  const { actingRole, serviceRoleKey } = verified;

  let body: { fullName?: unknown; phone?: unknown; address?: unknown; role?: unknown; branchId?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_INPUT", "Malformed request body.", 400);
  }

  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const address = typeof body.address === "string" ? body.address.trim() : "";
  const role = typeof body.role === "string" ? (body.role as UserRoleName) : null;
  const branchId = typeof body.branchId === "string" ? body.branchId : "";

  if (!fullName) {
    return errorResponse("FULL_NAME_REQUIRED", "Enter the employee's full name.", 400);
  }
  if (!phone) {
    return errorResponse("PHONE_REQUIRED", "Enter the employee's phone number.", 400);
  }
  if (!role || !USER_ROLES.includes(role)) {
    return errorResponse("INVALID_INPUT", "Select a valid role.", 400);
  }
  if (!branchId) {
    return errorResponse("INVALID_INPUT", "Missing branch.", 400);
  }
  if (!actingRole.canAssignRole(role)) {
    return errorResponse(
      "FORBIDDEN_ROLE_ASSIGNMENT",
      "Your account is not permitted to create an account with that role.",
      403,
    );
  }

  const adminClient = createClient<Database>(env.supabaseUrl ?? "", serviceRoleKey);

  const { data: codeData, error: codeError } = await adminClient.rpc("next_employee_code");
  if (codeError || !codeData) {
    return errorResponse("ACCOUNT_CREATE_FAILED", codeError?.message ?? "Could not generate an Employee ID.", 500);
  }
  const employeeCode = codeData;

  // Never shown, never usable to sign in as this employee — a real,
  // known password only exists once Set Password runs.
  const placeholderPassword = randomBytes(32).toString("hex");
  const syntheticEmail = `${employeeCode.toLowerCase()}@staff.9thround.internal`;

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: syntheticEmail,
    password: placeholderPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    return errorResponse("ACCOUNT_CREATE_FAILED", createError?.message ?? "Could not create the account.", 500);
  }

  // handle_new_user() already inserted a 'member' profiles row — set the
  // real role/branch/contact info/Employee ID now, in this same trusted
  // server-side context.
  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ role, branch_id: branchId, phone, address: address || null, employee_code: employeeCode })
    .eq("id", created.user.id);
  if (updateError) {
    return errorResponse("ACCOUNT_CREATE_FAILED", updateError.message, 500);
  }

  // The profiles UPDATE above ran on the service-role client (no
  // auth.uid()), so the automatic audit trigger stayed silent — see
  // log_profile_change()'s comment (20260815000002_permissions_and_staff_status.sql).
  // This is the explicit "Create User" entry, correctly attributed to the
  // acting admin verified above.
  await adminClient.rpc("log_audit_event_as", {
    p_actor_id: verified.callerId,
    p_action: "create_user",
    p_entity_type: "staff",
    p_entity_id: created.user.id,
    p_new_value: { full_name: fullName, role, branch_id: branchId, employee_code: employeeCode },
  });

  return Response.json({ profileId: created.user.id, employeeCode });
}
