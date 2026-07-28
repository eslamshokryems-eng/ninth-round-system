/**
 * The only place `process.env.EXPO_PUBLIC_*` is read — every other module
 * imports from here, never `process.env` directly. Values are read (not
 * validated) at import time; validation happens lazily in
 * `composition-root.ts`, the moment something actually needs a working
 * Supabase client — this lets screens that don't touch the backend
 * (language picker, welcome carousel) run even before a real Supabase
 * project's credentials exist. See .env.example at the repo root and
 * docs/phase-1/12-implementation-status.md.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
};
