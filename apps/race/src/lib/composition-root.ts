import { createRaceModule, createRaceSupabaseClient, type RaceSupabaseClient } from "@9thround/race";
import { env } from "./env";

let client: RaceSupabaseClient | null = null;

/** The single Supabase client of THE NINTH's own project. Session persists in this site's own localStorage. */
export function getRaceClient(): RaceSupabaseClient {
  if (client) return client;
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error("Missing THE NINTH Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example).");
  }
  try {
    new URL(env.supabaseUrl);
  } catch {
    throw new Error(`Invalid NEXT_PUBLIC_SUPABASE_URL: "${env.supabaseUrl}" is not a well-formed absolute URL.`);
  }
  client = createRaceSupabaseClient({ url: env.supabaseUrl, anonKey: env.supabaseAnonKey, auth: { persistSession: true } });
  return client;
}

let raceModule: ReturnType<typeof createRaceModule> | null = null;

export function getRaceModule(): ReturnType<typeof createRaceModule> {
  raceModule ??= createRaceModule(getRaceClient());
  return raceModule;
}
