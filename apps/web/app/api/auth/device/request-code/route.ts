import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import type { Database } from "@9thround/database-types";
import { env } from "../../../../../src/lib/env";
import { errorResponse } from "../../../../../src/lib/verify-staff-admin";
import { verifyAuthenticatedUser } from "../../../../../src/lib/verify-authenticated-user";
import { sendDeviceVerificationEmail } from "../../../../../src/lib/send-device-verification-email";
import { generateOtp, hashDeviceCode, hasDeviceCodePepper, OTP_TTL_MS } from "../../../../../src/lib/device-verification-crypto";

/**
 * Requests a fresh OTP for the calling (already-authenticated) employee's
 * unrecognized device, emailed to the administrator address configured in
 * security_settings — never to the employee's own address, and never
 * returned in this response. The employee is told only that a code was
 * sent; the administrator relays it out of band (phone/in person), per the
 * approved design.
 *
 * Every limit (cooldown, codes per hour and per day, the cumulative failure
 * lockout) and the supersession of earlier codes is decided INSIDE the
 * database by issue_device_verification_code(), under a per-user lock, so
 * parallel requests cannot slip past them. This handler cannot loosen them.
 */
export async function POST(request: Request) {
  const verified = await verifyAuthenticatedUser(request);
  if (verified instanceof Response) return verified;
  const { callerId, serviceRoleKey } = verified;

  // Fail closed BEFORE doing anything else: no pepper, no codes.
  if (!hasDeviceCodePepper()) {
    return errorResponse("SERVER_MISCONFIGURED", "Device verification is not configured on the server.", 500);
  }

  const adminClient = createClient<Database>(env.supabaseUrl ?? "", serviceRoleKey);

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("full_name, employee_code")
    .eq("id", callerId)
    .maybeSingle();
  if (profileError || !profile) {
    return errorResponse("REQUEST_CODE_FAILED", "Could not verify your account.", 500);
  }

  const { data: setting, error: settingError } = await adminClient
    .from("security_settings")
    .select("value")
    .eq("key", "device_verification_admin_email")
    .maybeSingle();
  if (settingError || !setting?.value) {
    return errorResponse(
      "ADMIN_EMAIL_NOT_CONFIGURED",
      "No administrator verification email is configured yet. Ask a Super Admin to set it under Security.",
      500,
    );
  }

  const code = generateOtp();
  const codeId = randomUUID();
  const codeHash = hashDeviceCode(callerId, codeId, code);

  const { data: issued, error: issueError } = await adminClient.rpc("issue_device_verification_code", {
    p_user_id: callerId,
    p_code_id: codeId,
    p_code_hash: codeHash,
  });
  if (issueError) {
    return errorResponse("REQUEST_CODE_FAILED", "Could not issue a verification code.", 500);
  }

  if (issued === "cooldown") {
    return errorResponse("RATE_LIMITED", "Please wait a moment before requesting another code.", 429);
  }
  if (issued === "hourly_limit" || issued === "daily_limit") {
    await adminClient.rpc("log_audit_event_as", {
      p_actor_id: callerId,
      p_action: "device_verification_rate_limited",
      p_entity_type: "device",
      p_entity_id: callerId,
      p_new_value: { limit: issued },
    });
    return errorResponse("RATE_LIMITED", "Too many verification codes requested. Try again later.", 429);
  }
  if (issued === "locked") {
    await adminClient.rpc("log_audit_event_as", {
      p_actor_id: callerId,
      p_action: "device_verification_locked",
      p_entity_type: "device",
      p_entity_id: callerId,
      p_new_value: { reason: "failed_attempts" },
    });
    return errorResponse("TOO_MANY_ATTEMPTS", "Too many incorrect attempts. Try again later.", 429);
  }
  if (issued !== "issued") {
    return errorResponse("REQUEST_CODE_FAILED", "Could not issue a verification code.", 500);
  }

  const employeeLabel = `${profile.full_name ?? "An employee"}${profile.employee_code ? ` (ID ${profile.employee_code})` : ""}`;
  const emailResult = await sendDeviceVerificationEmail({
    to: setting.value,
    employeeLabel,
    code,
    expiresInMinutes: Math.round(OTP_TTL_MS / 60_000),
  });

  await adminClient.rpc("log_audit_event_as", {
    p_actor_id: callerId,
    p_action: "device_verification_requested",
    p_entity_type: "device",
    p_entity_id: callerId,
    p_new_value: { email_sent: emailResult.ok },
  });

  if (!emailResult.ok) {
    // A code that could not be delivered is useless and must not stay live.
    await adminClient
      .from("device_verification_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", codeId);
    return errorResponse("REQUEST_CODE_FAILED", "Could not send the verification email. Try again shortly.", 500);
  }

  return Response.json({ ok: true });
}
