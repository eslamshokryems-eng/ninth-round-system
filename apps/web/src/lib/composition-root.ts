import { createSupabaseClient, type TypedSupabaseClient } from "@9thround/supabase-client";
import { createIdentityModule } from "@9thround/identity";
import { createReceptionModule } from "@9thround/reception";
import { env } from "./env";

let client: TypedSupabaseClient | null = null;

/**
 * Lazily constructs the single Supabase client instance the whole app
 * shares — mirrors apps/mobile/src/lib/composition-root.ts. No custom
 * `storage` adapter is passed: in a browser, supabase-js defaults to
 * `window.localStorage`, which is exactly what a persistent Reception
 * session needs (no SecureStore equivalent exists on the web, nor is one
 * needed — the anon key + RLS is the actual security boundary, same as
 * on mobile).
 */
export function getSupabaseClient(): TypedSupabaseClient {
  if (client) return client;

  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      "Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).",
    );
  }

  try {
    new URL(env.supabaseUrl);
  } catch {
    throw new Error(
      `Invalid NEXT_PUBLIC_SUPABASE_URL: "${env.supabaseUrl}" is not a well-formed absolute URL. ` +
        'It must look like "https://xxxxx.supabase.co" — no quotes, no surrounding whitespace, ' +
        "and it must include the https:// scheme.",
    );
  }

  client = createSupabaseClient({
    url: env.supabaseUrl,
    anonKey: env.supabaseAnonKey,
    auth: { persistSession: true },
  });
  return client;
}

let identityModule: ReturnType<typeof createIdentityModule> | null = null;

export function getIdentityModule(): ReturnType<typeof createIdentityModule> {
  identityModule ??= createIdentityModule(getSupabaseClient());
  return identityModule;
}

let receptionModule: ReturnType<typeof createReceptionModule> | null = null;

export function getReceptionModule(): ReturnType<typeof createReceptionModule> {
  receptionModule ??= createReceptionModule(getSupabaseClient());
  return receptionModule;
}
