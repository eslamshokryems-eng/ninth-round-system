import { createClient } from "@supabase/supabase-js";
import type { Database } from "@9thround/database-types";
import { Role, USER_ROLES, type UserRoleName } from "@9thround/identity";
import { env } from "../../../../src/lib/env";

/**
 * The only file in this app that reads `SUPABASE_SERVICE_ROLE_KEY` — a
 * plain server env var (no `NEXT_PUBLIC_` prefix), so Next.js never bundles
 * it into client JavaScript. Route Handlers run on the server; this file is
 * never sent to the browser. See docs/13-ddd-architecture.md and
 * apps/web/src/lib/env.ts's own comment on why NEXT_PUBLIC_* is safe but
 * this key is not.
 *
 * Creates a brand-new staff login (email + temporary password) and assigns
 * it a role in one step — the counterpart to Manage Staff's
 * search-and-promote flow (packages/identity/application/assign-staff-role.ts)
 * for someone who has never signed in before. `Role.canAssignRole` is the
 * same authorization rule used there, re-checked here independently since
 * this endpoint, unlike the use case, must also verify the caller's
 * identity itself (a Route Handler has no ambient session).
 */
function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.supabaseUrl || !serviceRoleKey) {
    return errorResponse(
      "SERVER_MISCONFIGURED",
      "Server is missing Supabase configuration.",
      500,
    );
  }

  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) {
    return errorResponse("UNAUTHORIZED", "Missing session.", 401);
  }

  let body: {
    email?: unknown;
    password?: unknown;
    fullName?: unknown;
    role?: unknown;
    branchId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_INPUT", "Malformed request body.", 400);
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const role = typeof body.role === "string" ? (body.role as UserRoleName) : null;
  const branchId = typeof body.branchId === "string" ? body.branchId : "";

  if (!email || !email.includes("@")) {
    return errorResponse("INVALID_EMAIL", "Enter a valid email address.", 400);
  }
  if (password.length < 6) {
    return errorResponse("INVALID_PASSWORD", "Temporary password must be at least 6 characters.", 400);
  }
  if (!fullName) {
    return errorResponse("FULL_NAME_REQUIRED", "Enter the employee's full name.", 400);
  }
  if (!role || !USER_ROLES.includes(role)) {
    return errorResponse("INVALID_INPUT", "Select a valid role.", 400);
  }
  if (!branchId) {
    return errorResponse("INVALID_INPUT", "Missing branch.", 400);
  }

  // Identify the caller from their own access token (anon-key client, RLS
  // still applies) — never trust a client-supplied "I am an admin" claim.
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
  if (!actingRole.canAssignRole(role)) {
    return errorResponse(
      "FORBIDDEN_ROLE_ASSIGNMENT",
      "Your account is not permitted to create an account with that role.",
      403,
    );
  }

  const adminClient = createClient<Database>(env.supabaseUrl, serviceRoleKey);

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    const isDuplicate = createError?.message.toLowerCase().includes("already");
    return errorResponse(
      isDuplicate ? "EMAIL_ALREADY_REGISTERED" : "ACCOUNT_CREATE_FAILED",
      isDuplicate
        ? "An account with this email already exists."
        : (createError?.message ?? "Could not create the account."),
      isDuplicate ? 409 : 500,
    );
  }

  // handle_new_user() already inserted a 'member' profiles row — set the
  // real role/branch now, in the same trusted server-side context.
  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ role, branch_id: branchId })
    .eq("id", created.user.id);
  if (updateError) {
    return errorResponse("ACCOUNT_CREATE_FAILED", updateError.message, 500);
  }

  return Response.json({ profileId: created.user.id });
}
