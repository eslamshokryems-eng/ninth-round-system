import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@9thround/database-types";

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * The only place `createClient` is called. Every bounded context's
 * `infrastructure/` layer receives an already-constructed client (dependency
 * injection at the app's composition root — see
 * apps/mobile/src/lib/composition-root.ts / apps/web/src/lib/composition-root.ts),
 * rather than importing and constructing its own — this is what lets tests
 * substitute a fake client without any context needing to know how the real
 * one is built. See docs/13-ddd-architecture.md.
 */
export function createSupabaseClient(params: {
  url: string;
  anonKey: string;
  auth?: { persistSession?: boolean; storage?: unknown };
}): TypedSupabaseClient {
  return createClient<Database>(params.url, params.anonKey, {
    auth: {
      persistSession: params.auth?.persistSession ?? true,
      storage: params.auth?.storage as never,
      autoRefreshToken: true,
    },
  });
}
