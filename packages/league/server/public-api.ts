import { clientKey } from "./client-id";
import type { PublicApiConfig, RateRule } from "./config";
import { GuardedLimiter, MemoryLimiter, RestRedisLimiter, type RateLimiter } from "./rate-limit";
import { sanitizeAthlete, sanitizeResults, sanitizeSeason } from "./sanitize";
import { TtlCache } from "./ttl-cache";

/**
 * The public league API: the ONLY server-side path to the three public database reads.
 *   GET …/season/<slug>                       -> race_league_public_season
 *   GET …/season/<slug>/week/<1-8>            -> race_league_public_challenge_results
 *   GET …/season/<slug>/athlete/<publicId>    -> race_league_public_participant
 * Each response is an explicit allow-list, cacheable by a shared (edge) cache for `ttlSeconds`, and rate limited per caller on cache misses.
 * Nothing authenticated is read or forwarded: the upstream call carries only the project's public anon key.
 */
export type Kind = "season" | "results" | "athlete";
export interface Params { readonly slug: string; readonly week?: string; readonly publicId?: string }

export interface PublicApiDeps {
  readonly config: PublicApiConfig;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly limiter?: RateLimiter | null;
  readonly log?: (message: string) => void;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PUBLIC_ID = /^[a-z0-9]{8,32}$/;

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", ...headers },
  });
}
const noStore = (status: number, error: string, extra: Record<string, string> = {}): Response => json(status, { error }, { "Cache-Control": "no-store", ...extra });

export function createPublicApi(deps: PublicApiDeps) {
  const { config } = deps;
  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const log = deps.log ?? (() => undefined);
  const cache = new TtlCache<{ status: number; body: unknown }>(now);
  let limiter: GuardedLimiter | null = null;
  let mode: "distributed" | "instance" | "dev" | null = null;
  const buildLimiter = (): GuardedLimiter | null => {
    if (limiter) return limiter;
    if (deps.limiter) { limiter = new GuardedLimiter(deps.limiter, now, log); mode = "distributed"; }
    else if (config.limiter === "upstash-rest" && config.limiterUrl && config.limiterToken) { limiter = new GuardedLimiter(new RestRedisLimiter(config.limiterUrl, config.limiterToken, fetchImpl, now), now, log); mode = "distributed"; }
    else if (config.limiter === "memory") { limiter = new GuardedLimiter(new MemoryLimiter(now), now, log); mode = "instance"; }
    else if (!config.production) { limiter = new GuardedLimiter(new MemoryLimiter(now), now, log); mode = "dev"; }
    return limiter;
  };

  async function upstream(kind: Kind, p: Params): Promise<{ status: number; body: unknown } | "broken"> {
    if (!config.supabaseUrl || !config.supabaseAnonKey) return "broken";
    const [fn, args, clean] = kind === "season"
      ? (["race_league_public_season", { p_slug: p.slug }, sanitizeSeason] as const)
      : kind === "results"
        ? (["race_league_public_challenge_results", { p_slug: p.slug, p_week: Number(p.week) }, sanitizeResults] as const)
        : (["race_league_public_participant", { p_slug: p.slug, p_public_id: p.publicId }, sanitizeAthlete] as const);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
    try {
      const res = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/${fn}`, {
        method: "POST",
        headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}`, "Content-Type": "application/json", Accept: "application/json", ...(config.gateSecret ? { "x-league-gate": config.gateSecret } : {}) },
        body: JSON.stringify(args),
        signal: ctl.signal,
        ...({ cache: "no-store" } as Record<string, unknown>), // never reuse a framework-level fetch cache for this call
      });
      if (!res.ok) return "broken";
      const cleaned = clean(await res.json());
      if (cleaned === null) return "broken";
      return cleaned.available === false ? { status: 404, body: { available: false } } : { status: 200, body: cleaned };
    } catch {
      return "broken";
    } finally {
      clearTimeout(timer);
    }
  }

  return async function handle(kind: Kind, req: Request, p: Params): Promise<Response> {
    if (req.method !== "GET") return noStore(405, "method_not_allowed", { Allow: "GET" });
    // No query string is ever meaningful here. Refusing it also closes the cache-busting trick (?x=1, ?x=2 … each a distinct cache key).
    if (new URL(req.url).search !== "") return noStore(400, "unexpected_query");
    // Exactly ONE spelling of a URL is valid: lower-case, no percent-encoding. Variants (…/Season-A, …/p%69lot) would be distinct edge-cache keys for the same data.
    if (new URL(req.url).pathname.includes("%")) return noStore(400, "non_canonical_path");
    const slug = p.slug;
    if (!SLUG.test(slug) || slug.length < 3 || slug.length > 60) return noStore(400, "bad_season");
    if (kind === "results" && !/^[1-8]$/.test(p.week ?? "")) return noStore(400, "bad_week");
    if (kind === "athlete" && !PUBLIC_ID.test(p.publicId ?? "")) return noStore(400, "bad_athlete");
    if (config.misconfiguration) {
      log(`public league API refused: ${config.misconfiguration}`);
      return noStore(503, "protection_not_configured", { "Retry-After": "60" });
    }
    const guard = buildLimiter();
    if (!guard) return noStore(503, "protection_not_configured", { "Retry-After": "60" });
    const rule: RateRule = config.rules[kind];
    const who = await clientKey(req.headers, config.trustedProxy, config.salt ?? "dev-only-salt");
    const d = await guard.check(`${kind}:${who}`, rule);
    const limitHeaders = { "X-League-RateLimit": `${d.mode};${mode}` };
    if (!d.allowed) return noStore(429, "rate_limited", { "Retry-After": String(d.resetSeconds), ...limitHeaders });

    const key = kind === "season" ? `s|${slug}` : kind === "results" ? `r|${slug}|${p.week}` : `a|${slug}|${p.publicId}`;
    const got = await cache.get(key, async () => {
      const r = await upstream(kind, { ...p, slug });
      if (r === "broken") return { value: { status: 502, body: { error: "upstream_unavailable" } }, ttlMs: 0 };
      return { value: r, ttlMs: Math.min(r.status === 200 ? config.ttlSeconds : config.negativeTtlSeconds, config.originTtlSeconds) * 1000 };
    });
    const v = got.value;
    if (v.status === 502) return noStore(502, "upstream_unavailable", limitHeaders);
    const ttl = v.status === 200 ? config.ttlSeconds : config.negativeTtlSeconds;
    // public: a shared cache may keep it for ttl seconds. max-age=0: browsers revalidate. No Set-Cookie, no Vary on anything the caller controls.
    return json(v.status, v.body, { "Cache-Control": `public, max-age=0, s-maxage=${ttl}`, "X-League-Cache": got.hit ? "HIT" : "MISS", ...limitHeaders });
  };
}
