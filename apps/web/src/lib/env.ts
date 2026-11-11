/**
 * The only place `process.env.NEXT_PUBLIC_*` is read — every other module
 * imports from here, never `process.env` directly. Mirrors
 * apps/mobile/src/lib/env.ts. Values are read (not validated) at import
 * time; validation happens lazily in composition-root.ts, the moment
 * something actually needs a working Supabase client. Both of these are
 * `NEXT_PUBLIC_*` (browser-exposed) on purpose — the anon key is meant to
 * be public; RLS, not secrecy, is what protects the data. The
 * service_role key must never be read here or passed to any client
 * component — see .env.example.
 */
const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

export const env = {
  /**
   * The Supabase URL for THIS runtime.
   *
   * Normally just NEXT_PUBLIC_SUPABASE_URL. For LOCAL DEVELOPMENT behind a
   * remote preview, that variable can be the sentinel `same-origin`: the page
   * runs in the developer's browser, where `http://127.0.0.1:54321` means
   * their own machine, so the browser must call the app's own origin instead,
   * and next.config.mjs relays /auth/v1 and /rest/v1 to the local gateway
   * (LOCAL_GATEWAY_URL). Server code has no browser origin, so it uses
   * SUPABASE_INTERNAL_URL. With a real URL configured (every deployed
   * environment) none of this applies and the value is returned unchanged.
   */
  get supabaseUrl(): string | undefined {
    if (configuredSupabaseUrl === "same-origin") {
      return typeof window !== "undefined" ? window.location.origin : process.env.SUPABASE_INTERNAL_URL;
    }
    return configuredSupabaseUrl;
  },
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};
