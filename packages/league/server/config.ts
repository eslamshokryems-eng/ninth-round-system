/**
 * Configuration of the PUBLIC league API (cache + rate limit). Every value comes from the environment, is validated and clamped here, and has a safe default.
 * Nothing here is a secret except LEAGUE_RATELIMIT_REST_TOKEN and LEAGUE_RATELIMIT_SALT, which live only in the host's server-side environment.
 */
export type LimiterKind = "upstash-rest" | "memory" | "none";
export interface RateRule { readonly limit: number; readonly windowSeconds: number }

export interface PublicApiConfig {
  readonly production: boolean;
  readonly supabaseUrl: string | null;
  readonly supabaseAnonKey: string | null;
  /** How long a response may be served from any cache (edge CDN and the in-process cache). The documented consistency window. */
  readonly ttlSeconds: number;
  /** How long THIS server process keeps a result (burst protection + single-flight). Kept short on purpose: it is added to the edge TTL in the worst case. */
  readonly originTtlSeconds: number;
  /** How long "this season is not available" may be cached (kept short so a newly published season appears quickly). */
  readonly negativeTtlSeconds: number;
  readonly limiter: LimiterKind;
  readonly limiterUrl: string | null;
  readonly limiterToken: string | null;
  /** "vercel": the client address is read from the header Vercel's proxy sets and overwrites. "none": no header is trusted. */
  readonly trustedProxy: "vercel" | "none";
  readonly salt: string | null;
  /** Sent to the database in the `x-league-gate` header. The public database functions answer only a request that carries it, so the API (cache + limiter) cannot be bypassed by calling them directly with the public anon key. */
  readonly gateSecret: string | null;
  readonly rules: { readonly season: RateRule; readonly results: RateRule; readonly athlete: RateRule };
  /** Reason the API must refuse to serve (production without protection configured), or null when it is safe to serve. */
  readonly misconfiguration: string | null;
}

type Env = Readonly<Record<string, string | undefined>>;

function int(env: Env, name: string, def: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export function readPublicApiConfig(env: Env): PublicApiConfig {
  const production = env.NODE_ENV === "production";
  const limiterRaw = (env.LEAGUE_RATELIMIT_BACKEND ?? "").trim().toLowerCase();
  const limiter: LimiterKind = limiterRaw === "upstash-rest" || limiterRaw === "memory" ? limiterRaw : "none";
  const windowSeconds = int(env, "LEAGUE_RATELIMIT_WINDOW_SECONDS", 60, 10, 3600);
  const url = env.LEAGUE_RATELIMIT_REST_URL?.trim() || null;
  const token = env.LEAGUE_RATELIMIT_REST_TOKEN?.trim() || null;
  const salt = env.LEAGUE_RATELIMIT_SALT?.trim() || null;
  const gateSecret = env.LEAGUE_PUBLIC_GATE_SECRET?.trim() || null;
  const trustedProxy = (env.LEAGUE_TRUSTED_PROXY ?? "").trim().toLowerCase() === "vercel" ? "vercel" : "none";
  let misconfiguration: string | null = null;
  if (production) {
    if (limiter === "none") misconfiguration = "no rate-limit backend is configured (set LEAGUE_RATELIMIT_BACKEND)";
    else if (limiter === "upstash-rest" && (!url || !token)) misconfiguration = "the distributed rate limiter needs LEAGUE_RATELIMIT_REST_URL and LEAGUE_RATELIMIT_REST_TOKEN";
    else if (salt === null || salt.length < 16) misconfiguration = "LEAGUE_RATELIMIT_SALT (at least 16 characters) is required so client addresses are never stored or logged in clear";
    else if (gateSecret === null || gateSecret.length < 24) misconfiguration = "LEAGUE_PUBLIC_GATE_SECRET (at least 24 characters, the same value a Super Admin stored with race_league_set_public_gate) is required so the database answers only this API";
    else if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) misconfiguration = "the Supabase public URL / key are not configured";
  }
  return {
    production,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") || null,
    supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
    ttlSeconds: int(env, "LEAGUE_CACHE_TTL_SECONDS", 15, 5, 120),
    originTtlSeconds: Math.min(int(env, "LEAGUE_CACHE_TTL_SECONDS", 15, 5, 120), int(env, "LEAGUE_ORIGIN_CACHE_SECONDS", 3, 0, 30)),
    negativeTtlSeconds: int(env, "LEAGUE_CACHE_NEGATIVE_TTL_SECONDS", 5, 1, 30),
    limiter,
    limiterUrl: url,
    limiterToken: token,
    trustedProxy,
    salt,
    gateSecret,
    rules: {
      season: { limit: int(env, "LEAGUE_RATELIMIT_SEASON_PER_WINDOW", 60, 1, 10_000), windowSeconds },
      results: { limit: int(env, "LEAGUE_RATELIMIT_RESULTS_PER_WINDOW", 60, 1, 10_000), windowSeconds },
      athlete: { limit: int(env, "LEAGUE_RATELIMIT_ATHLETE_PER_WINDOW", 30, 1, 10_000), windowSeconds },
    },
    misconfiguration,
  };
}
