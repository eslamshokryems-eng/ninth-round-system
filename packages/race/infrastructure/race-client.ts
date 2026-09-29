import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RaceDatabase } from "./race-database";

/** THE NINTH's Supabase client type — bound to the race project's own schema, never the gym's. */
export type RaceSupabaseClient = SupabaseClient<RaceDatabase>;

export interface RaceClientParams {
  /** NEXT_PUBLIC_SUPABASE_URL of the THE NINTH project. */
  url: string;
  /** NEXT_PUBLIC_SUPABASE_ANON_KEY of the THE NINTH project. Never the service-role key. */
  anonKey: string;
  auth?: { persistSession?: boolean; storage?: unknown };
}

/** The only place the race app calls createClient. */
export function createRaceSupabaseClient(params: RaceClientParams): RaceSupabaseClient {
  return createClient<RaceDatabase>(params.url, params.anonKey, {
    auth: { persistSession: params.auth?.persistSession ?? true, storage: params.auth?.storage as never, autoRefreshToken: true },
  });
}
