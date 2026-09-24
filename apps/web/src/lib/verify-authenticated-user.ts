import { createClient } from "@supabase/supabase-js";
import type { Database } from "@9thround/database-types";
import { Role, type UserRoleName } from "@9thround/identity";
import { env } from "./env";
import { errorResponse } from "./verify-staff-admin";

/**
 * Identity-only counterpart to verify-staff-admin.ts's verifyStaffAdmin():
 * confirms the request carries a valid Supabase session and resolves the
 * caller's own profile, but — unlike verifyStaffAdmin() — does not require
 * an admin role. Every /api/auth/device/* route needs to know *who* is
 * asking (to scope trusted_devices/device_verification_codes rows to that
 * user_id) before it does anything privileged with the service-role key;
 * only the two device-management routes (list/revoke) layer their own
 * super_admin check on top, the same way delete-account/route.ts layers
 * isSuperAdmin() on top of verifyStaffAdmin()'s isAdmin() check.
 */
export async function verifyAuthenticatedUser(
  request: Request,
): Promise<{ actingRole: Role; callerId: string; serviceRoleKey: string } | Response> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.supabaseUrl || !serviceRoleKey) {
    return errorResponse("SERVER_MISCONFIGURED", "Server is missing Supabase configuration.", 500);
  }

  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) {
    return errorResponse("UNAUTHORIZED", "Missing session.", 401);
  }

  const callerClient = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey ?? "", {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return errorResponse("UNAUTHORIZED", "Invalid or expired session.", 401);
  }

  const { data: callerProfile, error: callerProfileError } = await callerClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (callerProfileError || !callerProfile) {
    return errorResponse("UNAUTHORIZED", "Could not verify your account.", 401);
  }

  const actingRole = Role.of(callerProfile.role as UserRoleName);
  return { actingRole, callerId: userData.user.id, serviceRoleKey };
}
