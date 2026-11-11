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
  hashDeviceCode,
  hashSecret,
  hashesMatch,
  hasDeviceCodePepper,
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

  // Fail closed: with no pepper no code can be checked, and no unkeyed fallback exists.
  if (!hasDeviceCodePepper()) {
    return errorResponse("SERVER_MISCONFIGURED", "Device verification is not configured on the server.", 500);
  }

  const adminClient = createClient<Database>(env.supabaseUrl ?? "", serviceRoleKey);

  // Step 1 — ask the database for permission to evaluate ONE guess. The check
  // (expiry, attempts left, cumulative failure lockout) and the increment that
  // records the attempt are a single atomic step under a per-user lock, and the
  // stored hash comes back ONLY when the attempt was granted. However many
  // requests arrive at once, the number of comparisons that can ever happen is
  // bounded by max_attempts.
  const { data: beginData, error: beginError } = await adminClient.rpc("begin_device_code_attempt", {
    p_user_id: callerId,
  });
  if (beginError) {
    return errorResponse("VERIFY_CODE_FAILED", "Could not verify that code.", 500);
  }
  const attempt = (Array.isArray(beginData) ? beginData[0] : beginData) as
    | { status: string; code_id: string | null; code_hash: string | null; attempts_used: number | null; attempts_max: number | null }
    | undefined;
  if (!attempt) {
    return errorResponse("VERIFY_CODE_FAILED", "Could not verify that code.", 500);
  }

  if (attempt.status === "not_found") {
    return errorResponse("CODE_NOT_FOUND", "No pending verification code. Request a new one.", 400);
  }
  if (attempt.status === "expired") {
    return errorResponse("CODE_EXPIRED", "This code has expired. Request a new one.", 400);
  }
  if (attempt.status === "locked") {
    await adminClient.rpc("log_audit_event_as", {
      p_actor_id: callerId,
      p_action: "device_verification_locked",
      p_entity_type: "device",
      p_entity_id: callerId,
      p_new_value: { reason: "attempts_exhausted" },
    });
    return errorResponse("TOO_MANY_ATTEMPTS", "Too many incorrect attempts. Request a new code.", 429);
  }
  if (attempt.status !== "ok" || !attempt.code_id || !attempt.code_hash) {
    return errorResponse("VERIFY_CODE_FAILED", "Could not verify that code.", 500);
  }

  // Step 2 — compare, in the server, with the keyed hash (constant time).
  const isMatch = hashesMatch(hashDeviceCode(callerId, attempt.code_id, code), attempt.code_hash);

  // Step 3 — record the outcome. A correct code is consumed with a WHERE
  // clause on "still unconsumed and unexpired", so of any number of
  // simultaneous correct submissions exactly one gets through.
  const { data: outcome, error: outcomeError } = await adminClient.rpc("complete_device_code_attempt", {
    p_user_id: callerId,
    p_code_id: attempt.code_id,
    p_matched: isMatch,
  });
  if (outcomeError) {
    return errorResponse("VERIFY_CODE_FAILED", "Could not verify that code.", 500);
  }

  if (!isMatch) {
    const lockedOut = outcome === "locked";
    await adminClient.rpc("log_audit_event_as", {
      p_actor_id: callerId,
      p_action: "device_verification_failed",
      p_entity_type: "device",
      p_entity_id: callerId,
      p_new_value: { attempts: attempt.attempts_used, locked_out: lockedOut },
    });
    return errorResponse(
      lockedOut ? "TOO_MANY_ATTEMPTS" : "INVALID_CODE",
      lockedOut ? "Too many incorrect attempts. Request a new code." : "Incorrect code.",
      lockedOut ? 429 : 400,
    );
  }

  if (outcome !== "verified") {
    // The code was correct but had already been used, superseded or expired by
    // the time it was recorded: a replay. Nothing is trusted.
    return errorResponse("CODE_NOT_FOUND", "No pending verification code. Request a new one.", 400);
  }

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
