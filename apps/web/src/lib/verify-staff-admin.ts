import { createClient } from "@supabase/supabase-js";
import type { Database } from "@9thround/database-types";
import { Role, type UserRoleName } from "@9thround/identity";
import { env } from "./env";

export function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

/**
 * Shared by every Route Handler under /api/staff/* — identifies the caller
 * from their own access token (never a client-supplied claim) and confirms
 * they're branch_manager/super_admin before anything privileged happens.
 * Returns either the resolved caller info or a Response to return as-is.
 *
 * The only place in this app that reads `SUPABASE_SERVICE_ROLE_KEY` — a
 * plain server env var (no `NEXT_PUBLIC_` prefix, never bundled to the
 * browser). This module itself only reads it and hands it back to the
 * calling Route Handler to build its own admin client with; it never
 * constructs a privileged client itself, so a Route Handler that forgets
 * to check this function's result can't accidentally get service_role
 * access anyway.
 */
export async function verifyStaffAdmin(
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
  if (!actingRole.isAdmin()) {
    return errorResponse("FORBIDDEN_ROLE_ASSIGNMENT", "Your account is not permitted to do this.", 403);
  }

  return { actingRole, callerId: userData.user.id, serviceRoleKey };
}
