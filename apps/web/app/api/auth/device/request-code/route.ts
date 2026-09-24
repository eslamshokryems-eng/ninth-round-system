import { createClient } from "@supabase/supabase-js";
import type { Database } from "@9thround/database-types";
import { env } from "../../../../../src/lib/env";
import { errorResponse } from "../../../../../src/lib/verify-staff-admin";
import { verifyAuthenticatedUser } from "../../../../../src/lib/verify-authenticated-user";
import { sendDeviceVerificationEmail } from "../../../../../src/lib/send-device-verification-email";
import { generateOtp, hashSecret, OTP_TTL_MS, OTP_RESEND_COOLDOWN_MS } from "../../../../../src/lib/device-verification-crypto";

/**
 * Requests a fresh OTP for the calling (already-authenticated) employee's
 * unrecognized device, emailed to the administrator address configured in
 * security_settings — never to the employee's own address, and never
 * returned in this response. The employee is told only that a code was
 * sent; the administrator relays it out of band (phone/in person), per the
 * approved design.
 */
export async function POST(request: Request) {
  const verified = await verifyAuthenticatedUser(request);
  if (verified instanceof Response) return verified;
  const { callerId, serviceRoleKey } = verified;

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

  const { data: recentCode, error: recentCodeError } = await adminClient
    .from("device_verification_codes")
    .select("created_at")
    .eq("user_id", callerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recentCodeError) {
    return errorResponse("REQUEST_CODE_FAILED", recentCodeError.message, 500);
  }
  if (recentCode && Date.now() - new Date(recentCode.created_at).getTime() < OTP_RESEND_COOLDOWN_MS) {
    return errorResponse("RATE_LIMITED", "Please wait a moment before requesting another code.", 429);
  }

  // Superseded by the new code below — prevents an old, still-unexpired
  // code from also being usable once a fresh one has been issued.
  await adminClient
    .from("device_verification_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("user_id", callerId)
    .is("consumed_at", null);

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  const { error: insertError } = await adminClient.from("device_verification_codes").insert({
    user_id: callerId,
    code_hash: hashSecret(code),
    expires_at: expiresAt,
  });
  if (insertError) {
    return errorResponse("REQUEST_CODE_FAILED", insertError.message, 500);
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
    return errorResponse("REQUEST_CODE_FAILED", "Could not send the verification email. Try again shortly.", 500);
  }

  return Response.json({ ok: true });
}
