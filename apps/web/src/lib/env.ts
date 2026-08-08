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
export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};
