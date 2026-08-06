import { createSupabaseClient, type TypedSupabaseClient } from "@9thround/supabase-client";
import { createIdentityModule } from "@9thround/identity";
import { createReceptionModule } from "@9thround/reception";
import { env } from "./env";
import { secureStoreAdapter } from "./secure-store-adapter";

let client: TypedSupabaseClient | null = null;

/**
 * Lazily constructs the single Supabase client instance the whole app
 * shares, validating environment configuration at the moment it's actually
 * needed rather than at module load — see env.ts for why. Every bounded
 * context's composition-root factory (today: `createIdentityModule`;
 * `createTrainingModule` etc. once those contexts are implemented) is wired
 * from this one client, matching docs/13-ddd-architecture.md §13.2.
 */
export function getSupabaseClient(): TypedSupabaseClient {
  if (client) return client;

  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      "Missing Supabase configuration. Set EXPO_PUBLIC_SUPABASE_URL and " +
        "EXPO_PUBLIC_SUPABASE_ANON_KEY (see .env.example) — no live Supabase " +
        "project is provisioned yet, see docs/phase-1/12-implementation-status.md.",
    );
  }

  client = createSupabaseClient({
    url: env.supabaseUrl,
    anonKey: env.supabaseAnonKey,
    auth: { persistSession: true, storage: secureStoreAdapter },
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
