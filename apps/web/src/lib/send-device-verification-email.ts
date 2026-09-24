/**
 * Server-only Resend integration for the Login Verification + Trusted
 * Device system. Calls Resend's REST API directly via `fetch` rather than
 * adding the `resend` npm package as a dependency — same secret-handling
 * outcome (the key never leaves the server), one fewer package to install.
 *
 * `RESEND_API_KEY` is read only here, the same "one file reads the secret"
 * posture verify-staff-admin.ts uses for SUPABASE_SERVICE_ROLE_KEY. Never
 * imported by a client component; this module is only ever reached from
 * Route Handlers under apps/web/app/api/auth/device/*.
 */

interface SendDeviceVerificationEmailInput {
  to: string;
  employeeLabel: string;
  code: string;
  expiresInMinutes: number;
}

export async function sendDeviceVerificationEmail(
  input: SendDeviceVerificationEmailInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) {
    return { ok: false, message: "Email is not configured on the server." };
  }

  const subject = `9th Round: verification code for ${input.employeeLabel}`;
  const text =
    `${input.employeeLabel} is signing in from a new device and needs your verification code.\n\n` +
    `Code: ${input.code}\n\n` +
    `This code expires in ${input.expiresInMinutes} minutes and can only be used once. ` +
    `Relay it to ${input.employeeLabel} only if you recognize this sign-in attempt. ` +
    `If you weren't expecting this, ignore this email — the code will simply expire.`;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [input.to],
        subject,
        text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      return { ok: false, message: `Resend request failed (${response.status}): ${errorBody.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Could not reach the email provider." };
  }
}
