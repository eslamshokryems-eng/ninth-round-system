import { getSupabaseClient } from "./composition-root";

export interface ApiErrorBody {
  error?: { code: string; message: string };
}

/**
 * POSTs to one of this app's own Route Handlers (apps/web/app/api/**)
 * with the caller's own access token attached — those handlers verify it
 * server-side via verify-staff-admin.ts before doing anything privileged.
 * Extracted from create-staff-account-form.tsx once a second caller
 * (Manage Staff's activate/deactivate toggle) needed the same thing.
 */
export async function authorizedFetch(path: string, body: unknown): Promise<Response | null> {
  const { data: sessionData } = await getSupabaseClient().auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return null;
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(body),
  });
}
