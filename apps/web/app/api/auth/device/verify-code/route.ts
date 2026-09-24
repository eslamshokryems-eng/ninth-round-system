import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@9thround/database-types";
import { env } from "../../../../../src/lib/env";
import { errorResponse } from "../../../../../src/lib/verify-staff-admin";
import { verifyAuthenticatedUser } from "../../../../../src/lib/verify-authenticated-user";
import {
  DEVICE_COOKIE_NAME,
  TRUSTED_DEVICE_TTL_MS,
  generateDeviceToken,
  hashSecret,
  hashesMatch,
} from "../../../../../src/lib/device-verification-crypto";

/**
 * Consumes the OTP the administrator relayed to the employee. On success,
 * optionally trusts the current device for 30 days by minting a random
 * token, storing only its hash, and setting it as an HttpOnly/Secure
 * cookie — the raw token is never persisted server-side and never visible
 * to client JS.
 */
export async function POST(request: Request) {
  const verified = await verifyAuthenticatedUser(request);
  if (verified instanceof Response) return verified;
  const { callerId, serviceRoleKey } = verified;

  let body: { code?: unknown; trustDevice?: unknown; deviceName?: unknown };
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_INPUT", "Malformed request body.", 400);
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  const trustDevice = body.trustDevice === true;
  const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim().slice(0, 200) : null;

  if (!/^\d{6}$/.test(code)) {
    return errorResponse("INVALID_INPUT", "Enter the 6-digit code.", 400);
  }

  const adminClient = createClient<Database>(env.supabaseUrl ?? "", serviceRoleKey);

  const { data: pending, error: pendingError } = await adminClient
    .from("device_verification_codes")
    .select("id, code_hash, attempts, max_attempts, expires_at, consumed_at")
    .eq("user_id", callerId)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pendingError) {
    return errorResponse("VERIFY_CODE_FAILED", pendingError.message, 500);
  }
  if (!pending) {
    return errorResponse("CODE_NOT_FOUND", "No pending verification code. Request a new one.", 400);
  }
  if (new Date(pending.expires_at).getTime() <= Date.now()) {
    return errorResponse("CODE_EXPIRED", "This code has expired. Request a new one.", 400);
  }
  if (pending.attempts >= pending.max_attempts) {
    return errorResponse("TOO_MANY_ATTEMPTS", "Too many incorrect attempts. Request a new code.", 429);
  }

  const isMatch = hashesMatch(hashSecret(code), pending.code_hash);

  if (!isMatch) {
    const nextAttempts = pending.attempts + 1;
    const lockedOut = nextAttempts >= pending.max_attempts;
    await adminClient
      .from("device_verification_codes")
      .update({ attempts: nextAttempts, ...(lockedOut ? { consumed_at: new Date().toISOString() } : {}) })
      .eq("id", pending.id);

    await adminClient.rpc("log_audit_event_as", {
      p_actor_id: callerId,
      p_action: "device_verification_failed",
      p_entity_type: "device",
      p_entity_id: callerId,
      p_new_value: { attempts: nextAttempts, locked_out: lockedOut },
    });

    return errorResponse(
      lockedOut ? "TOO_MANY_ATTEMPTS" : "INVALID_CODE",
      lockedOut ? "Too many incorrect attempts. Request a new code." : "Incorrect code.",
      lockedOut ? 429 : 400,
    );
  }

  await adminClient
    .from("device_verification_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", pending.id);

  await adminClient.rpc("log_audit_event_as", {
    p_actor_id: callerId,
    p_action: "device_verification_succeeded",
    p_entity_type: "device",
    p_entity_id: callerId,
  });

  if (!trustDevice) {
    return Response.json({ ok: true, trusted: false });
  }

  const deviceToken = generateDeviceToken();
  const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_TTL_MS);

  const { error: trustError } = await adminClient.from("trusted_devices").insert({
    user_id: callerId,
    device_token_hash: hashSecret(deviceToken),
    device_name: deviceName,
    expires_at: expiresAt.toISOString(),
  });
  if (trustError) {
    // Verification itself already succeeded — don't fail the whole request
    // over the device-trust step; the employee just won't skip the OTP
    // next time.
    return Response.json({ ok: true, trusted: false });
  }

  cookies().set(DEVICE_COOKIE_NAME, deviceToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  await adminClient.rpc("log_audit_event_as", {
    p_actor_id: callerId,
    p_action: "device_trusted",
    p_entity_type: "device",
    p_entity_id: callerId,
    p_new_value: { device_name: deviceName },
  });

  return Response.json({ ok: true, trusted: true });
}
