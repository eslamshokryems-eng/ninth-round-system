import { createClient } from "@supabase/supabase-js";
import type { Database } from "@9thround/database-types";
import { env } from "../../../../../src/lib/env";
import { errorResponse } from "../../../../../src/lib/verify-staff-admin";
import { verifyAuthenticatedUser } from "../../../../../src/lib/verify-authenticated-user";

/**
 * Lists every trusted device across every employee — the Security page's
 * table. Super Admin only, matching the approved design ("a super_admin-
 * only 'Security / Trusted Devices' admin UI"). trusted_devices carries no
 * RLS policies at all (service-role-only), so this listing — same as
 * every other admin listing in this app — exists only behind this route's
 * own explicit role check, never a direct client-side query.
 */
export async function GET(request: Request) {
  const verified = await verifyAuthenticatedUser(request);
  if (verified instanceof Response) return verified;
  const { actingRole, serviceRoleKey } = verified;

  if (!actingRole.isSuperAdmin()) {
    return errorResponse("FORBIDDEN_ROLE_ASSIGNMENT", "Only Super Admin can view trusted devices.", 403);
  }

  const adminClient = createClient<Database>(env.supabaseUrl ?? "", serviceRoleKey);

  const { data, error } = await adminClient
    .from("trusted_devices")
    .select(
      "id, user_id, device_name, created_at, last_seen_at, expires_at, revoked_at, profile:profiles(full_name, employee_code, role)",
    )
    .order("last_seen_at", { ascending: false });

  if (error) {
    return errorResponse("LIST_DEVICES_FAILED", error.message, 500);
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    user_id: string;
    device_name: string | null;
    created_at: string;
    last_seen_at: string;
    expires_at: string;
    revoked_at: string | null;
    profile: { full_name: string | null; employee_code: string | null; role: string } | null;
  }>;

  const now = Date.now();
  const devices = rows.map((row) => ({
    deviceId: row.id,
    userId: row.user_id,
    fullName: row.profile?.full_name ?? "—",
    employeeCode: row.profile?.employee_code ?? "—",
    role: row.profile?.role ?? "—",
    deviceName: row.device_name,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    status: row.revoked_at ? "revoked" : new Date(row.expires_at).getTime() <= now ? "expired" : "active",
  }));

  return Response.json({ devices });
}
