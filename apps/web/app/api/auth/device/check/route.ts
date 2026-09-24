import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@9thround/database-types";
import { env } from "../../../../../src/lib/env";
import { verifyAuthenticatedUser } from "../../../../../src/lib/verify-authenticated-user";
import { DEVICE_COOKIE_NAME, hashSecret } from "../../../../../src/lib/device-verification-crypto";

/**
 * Called once per session by the Reception layout's device-trust gate
 * (app/(reception)/layout.tsx) right after sign-in. Reads the `td`
 * HttpOnly cookie server-side (the browser attaches it automatically —
 * client JS never sees its raw value) and checks it against this caller's
 * own trusted_devices rows. Never trusts a client-supplied device
 * identifier — the cookie plus the caller's own verified session is the
 * only input.
 */
export async function GET(request: Request) {
  const verified = await verifyAuthenticatedUser(request);
  if (verified instanceof Response) return verified;
  const { callerId, serviceRoleKey } = verified;

  const deviceToken = cookies().get(DEVICE_COOKIE_NAME)?.value;
  if (!deviceToken) {
    return Response.json({ trusted: false });
  }

  const adminClient = createClient<Database>(env.supabaseUrl ?? "", serviceRoleKey);
  const tokenHash = hashSecret(deviceToken);

  const { data, error } = await adminClient
    .from("trusted_devices")
    .select("id, expires_at, revoked_at")
    .eq("user_id", callerId)
    .eq("device_token_hash", tokenHash)
    .maybeSingle();

  if (error || !data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now()) {
    return Response.json({ trusted: false });
  }

  await adminClient.from("trusted_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);

  return Response.json({ trusted: true });
}
