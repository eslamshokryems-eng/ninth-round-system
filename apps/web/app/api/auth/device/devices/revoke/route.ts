import { createClient } from "@supabase/supabase-js";
import type { Database } from "@9thround/database-types";
import { env } from "../../../../../../src/lib/env";
import { errorResponse } from "../../../../../../src/lib/verify-staff-admin";
import { verifyAuthenticatedUser } from "../../../../../../src/lib/verify-authenticated-user";

/** Revokes one trusted device. Super Admin only. */
export async function POST(request: Request) {
  const verified = await verifyAuthenticatedUser(request);
  if (verified instanceof Response) return verified;
  const { actingRole, callerId, serviceRoleKey } = verified;

  if (!actingRole.isSuperAdmin()) {
    return errorResponse("FORBIDDEN_ROLE_ASSIGNMENT", "Only Super Admin can revoke trusted devices.", 403);
  }

  let body: { deviceId?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_INPUT", "Malformed request body.", 400);
  }

  const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
  if (!deviceId) {
    return errorResponse("INVALID_INPUT", "Select a device to revoke.", 400);
  }

  const adminClient = createClient<Database>(env.supabaseUrl ?? "", serviceRoleKey);

  const { data: device, error: fetchError } = await adminClient
    .from("trusted_devices")
    .select("id, user_id")
    .eq("id", deviceId)
    .maybeSingle();
  if (fetchError || !device) {
    return errorResponse("DEVICE_NOT_FOUND", "That device no longer exists.", 404);
  }

  const { error: updateError } = await adminClient
    .from("trusted_devices")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", deviceId);
  if (updateError) {
    return errorResponse("REVOKE_DEVICE_FAILED", updateError.message, 500);
  }

  await adminClient.rpc("log_audit_event_as", {
    p_actor_id: callerId,
    p_action: "device_revoked",
    p_entity_type: "device",
    p_entity_id: deviceId,
    p_new_value: { revoked_user_id: device.user_id },
  });

  return Response.json({ ok: true });
}
