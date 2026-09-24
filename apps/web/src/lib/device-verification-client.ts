import { authorizedFetch, type ApiErrorBody } from "./authorized-fetch";
import { getSupabaseClient } from "./composition-root";

/**
 * Thin client-side wrappers around /api/auth/device/*, mirroring
 * authorized-fetch.ts's pattern (attach the caller's own access token,
 * never a client-supplied identity claim). The `td` trusted-device cookie
 * itself is never touched here — it's HttpOnly, so the browser attaches
 * it to these same-origin requests automatically and this module never
 * sees its value.
 */

async function authorizedGet(path: string): Promise<Response | null> {
  const { data: sessionData } = await getSupabaseClient().auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return null;
  return fetch(path, { method: "GET", headers: { Authorization: `Bearer ${accessToken}` } });
}

export async function checkDeviceTrust(): Promise<{ trusted: boolean } | { error: string }> {
  const response = await authorizedGet("/api/auth/device/check");
  if (!response || !response.ok) return { error: "CHECK_FAILED" };
  return (await response.json()) as { trusted: boolean };
}

export async function requestVerificationCode(): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const response = await authorizedFetch("/api/auth/device/request-code", {});
  if (!response) return { ok: false, code: "UNAUTHORIZED", message: "Your session expired. Sign in again." };
  if (response.ok) return { ok: true };
  const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
  return {
    ok: false,
    code: body.error?.code ?? "REQUEST_CODE_FAILED",
    message: body.error?.message ?? "Could not send a verification code.",
  };
}

export async function submitVerificationCode(
  code: string,
  trustDevice: boolean,
  deviceName: string | null,
): Promise<{ ok: true; trusted: boolean } | { ok: false; code: string; message: string }> {
  const response = await authorizedFetch("/api/auth/device/verify-code", { code, trustDevice, deviceName });
  if (!response) return { ok: false, code: "UNAUTHORIZED", message: "Your session expired. Sign in again." };
  const body = (await response.json().catch(() => ({}))) as { trusted?: boolean } & ApiErrorBody;
  if (response.ok) return { ok: true, trusted: body.trusted === true };
  return {
    ok: false,
    code: body.error?.code ?? "VERIFY_CODE_FAILED",
    message: body.error?.message ?? "Could not verify that code.",
  };
}
