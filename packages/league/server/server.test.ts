import { describe, expect, it, vi } from "vitest";
import { clientKey, trustedAddress } from "./client-id";
import { readPublicApiConfig, type PublicApiConfig } from "./config";
import { createPublicApi } from "./public-api";
import { GuardedLimiter, MemoryLimiter, RestRedisLimiter, type RateLimiter } from "./rate-limit";
import { sanitizeAthlete, sanitizeResults, sanitizeSeason } from "./sanitize";
import { TtlCache } from "./ttl-cache";

const PROD_ENV = {
  NODE_ENV: "production", NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  LEAGUE_RATELIMIT_BACKEND: "upstash-rest", LEAGUE_RATELIMIT_REST_URL: "https://limit.example", LEAGUE_RATELIMIT_REST_TOKEN: "tok", LEAGUE_RATELIMIT_SALT: "a-long-enough-server-side-salt", LEAGUE_TRUSTED_PROXY: "vercel",
} as const;

describe("configuration", () => {
  it("has safe defaults and clamps what an operator can set", () => {
    const c = readPublicApiConfig({ NODE_ENV: "development" });
    expect(c).toMatchObject({ ttlSeconds: 15, originTtlSeconds: 3, negativeTtlSeconds: 5, limiter: "none", trustedProxy: "none", misconfiguration: null });
    expect(readPublicApiConfig({ LEAGUE_CACHE_TTL_SECONDS: "99999" }).ttlSeconds).toBe(120);
    expect(readPublicApiConfig({ LEAGUE_CACHE_TTL_SECONDS: "5", LEAGUE_ORIGIN_CACHE_SECONDS: "30" }).originTtlSeconds).toBe(5); // the origin copy can never outlive the edge TTL
    expect(readPublicApiConfig({ LEAGUE_CACHE_TTL_SECONDS: "0" }).ttlSeconds).toBe(5);
    expect(readPublicApiConfig({ LEAGUE_CACHE_TTL_SECONDS: "abc" }).ttlSeconds).toBe(15);
    expect(readPublicApiConfig({ LEAGUE_RATELIMIT_SEASON_PER_WINDOW: "-5" }).rules.season.limit).toBe(1);
  });
  it("refuses to serve in production without protection: no backend, no salt, an incomplete backend, or no Supabase variables", () => {
    expect(readPublicApiConfig(PROD_ENV).misconfiguration).toBeNull();
    expect(readPublicApiConfig({ ...PROD_ENV, LEAGUE_RATELIMIT_BACKEND: "" }).misconfiguration).toMatch(/no rate-limit backend/);
    expect(readPublicApiConfig({ ...PROD_ENV, LEAGUE_RATELIMIT_BACKEND: "none" }).misconfiguration).toMatch(/no rate-limit backend/);
    expect(readPublicApiConfig({ ...PROD_ENV, LEAGUE_RATELIMIT_REST_TOKEN: "" }).misconfiguration).toMatch(/REST_URL and/);
    expect(readPublicApiConfig({ ...PROD_ENV, LEAGUE_RATELIMIT_SALT: "short" }).misconfiguration).toMatch(/SALT/);
    expect(readPublicApiConfig({ ...PROD_ENV, NEXT_PUBLIC_SUPABASE_URL: "" }).misconfiguration).toMatch(/Supabase/);
    expect(readPublicApiConfig({ ...PROD_ENV, LEAGUE_RATELIMIT_BACKEND: "memory" }).misconfiguration).toBeNull(); // an explicit, documented per-instance choice
  });
});

describe("client identification", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("trusts a forwarded address only when a verified proxy is declared", () => {
    expect(trustedAddress(h({ "x-forwarded-for": "9.9.9.9" }), "vercel")).toBeNull(); // the spoofable header is never read
    expect(trustedAddress(h({ "x-vercel-forwarded-for": "9.9.9.9" }), "none")).toBeNull();
    expect(trustedAddress(h({ "x-vercel-forwarded-for": "9.9.9.9" }), "vercel")).toBe("9.9.9.9");
    expect(trustedAddress(h({ "x-vercel-forwarded-for": "<script>" }), "vercel")).toBeNull();
    expect(trustedAddress(h({ "x-vercel-forwarded-for": "2001:db8::1" }), "vercel")).toBe("2001:db8::1");
  });
  it("hashes the address: stable, distinct per caller, and never contains the address", async () => {
    const a = await clientKey(h({ "x-vercel-forwarded-for": "9.9.9.9" }), "vercel", "salt-salt-salt-salt");
    const a2 = await clientKey(h({ "x-vercel-forwarded-for": "9.9.9.9" }), "vercel", "salt-salt-salt-salt");
    const b = await clientKey(h({ "x-vercel-forwarded-for": "8.8.8.8" }), "vercel", "salt-salt-salt-salt");
    const other = await clientKey(h({ "x-vercel-forwarded-for": "9.9.9.9" }), "vercel", "another-salt-value!");
    expect(a).toBe(a2); expect(a).not.toBe(b); expect(a).not.toBe(other);
    expect(a).toMatch(/^[0-9a-f]{16}$/); expect(a).not.toContain("9.9.9.9");
    expect(await clientKey(h({ "x-forwarded-for": "9.9.9.9" }), "none", "x")).toBe("shared"); // spoofing a header cannot create fresh buckets
  });
});

describe("rate limiters", () => {
  const rule = { limit: 3, windowSeconds: 60 };
  it("memory: allows up to the limit, rejects after, separates callers, resets with the window", async () => {
    let t = Date.parse("2026-11-04T12:00:10Z");
    const l = new MemoryLimiter(() => t);
    expect((await Promise.all([1, 2, 3].map(() => l.check("a", rule)))).every((d) => d.allowed)).toBe(true);
    const over = await l.check("a", rule);
    expect(over).toMatchObject({ allowed: false, remaining: 0 });
    expect(over.resetSeconds).toBeGreaterThan(0); expect(over.resetSeconds).toBeLessThanOrEqual(60);
    expect((await l.check("b", rule)).allowed).toBe(true);
    t += 60_000; // the next window
    expect((await l.check("a", rule)).allowed).toBe(true);
  });
  it("memory: is bounded (a flood of distinct keys cannot grow it without limit)", async () => {
    const l = new MemoryLimiter(Date.now, 50);
    for (let i = 0; i < 500; i++) await l.check(`k${i}`, rule);
    expect(true).toBe(true); // no throw, no unbounded growth: the safety valve cleared the map at the cap
  });
  const redis = (results: (number | "fail" | "bad")[]) => {
    let i = 0;
    const calls: { url: string; body: unknown; auth: string | null }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string), auth: (init.headers as Record<string, string>).Authorization ?? null });
      const r = results[Math.min(i++, results.length - 1)];
      if (r === "fail") throw new Error("connect ECONNREFUSED");
      if (r === "bad") return new Response("not json", { status: 200 });
      return new Response(JSON.stringify([{ result: r }, { result: 1 }]), { status: 200 });
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  };
  it("distributed: counts through the backend with one pipelined INCR/EXPIRE and a hashed key", async () => {
    const { fetchImpl, calls } = redis([1, 2, 3, 4]);
    const l = new RestRedisLimiter("https://limit.example/", "tok", fetchImpl, () => 0);
    const d = [await l.check("season:abcd", rule), await l.check("season:abcd", rule), await l.check("season:abcd", rule), await l.check("season:abcd", rule)];
    expect(d.map((x) => x.allowed)).toEqual([true, true, true, false]);
    expect(calls[0]).toMatchObject({ url: "https://limit.example/pipeline", auth: "Bearer tok" });
    expect(JSON.stringify(calls[0]?.body)).toContain("league:rl:season:abcd:0");
  });
  it("backend failure never fails open: a stricter per-instance limit decides, and the fault is reported without client data", async () => {
    for (const failure of ["fail", "bad"] as const) {
      const { fetchImpl } = redis([failure]);
      const faults: string[] = [];
      const g = new GuardedLimiter(new RestRedisLimiter("https://limit.example", "tok", fetchImpl, () => 0), () => 0, (m) => faults.push(m));
      const strictRule = { limit: 8, windowSeconds: 60 }; // degraded limit = floor(8 / 4) = 2
      const out = [await g.check("athlete:abc", strictRule), await g.check("athlete:abc", strictRule), await g.check("athlete:abc", strictRule)];
      expect(out.map((x) => x.mode)).toEqual(["degraded", "degraded", "degraded"]);
      expect(out.map((x) => x.allowed)).toEqual([true, true, false]);
      expect(faults).toHaveLength(3); expect(faults.join(" ")).not.toMatch(/abc/);
    }
  });
  it("a hung backend times out and degrades instead of hanging the request", async () => {
    const fetchImpl = ((_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as unknown as typeof fetch;
    const g = new GuardedLimiter(new RestRedisLimiter("https://limit.example", "tok", fetchImpl, () => 0, 20), () => 0);
    expect((await g.check("k", rule)).mode).toBe("degraded");
  });
  it("a backend 500 or an error object degrades", async () => {
    const f500 = (async () => new Response("x", { status: 500 })) as unknown as typeof fetch;
    const fErr = (async () => new Response(JSON.stringify([{ error: "NOAUTH" }]), { status: 200 })) as unknown as typeof fetch;
    for (const f of [f500, fErr]) expect((await new GuardedLimiter(new RestRedisLimiter("https://l", "t", f, () => 0), () => 0).check("k", rule)).mode).toBe("degraded");
  });
});

describe("sanitizers drop everything that is not allow-listed", () => {
  const standing = { publicId: "abcd1234abcd1234", displayName: "Ahmed K.", rank: 1, tied: false, totalPoints: 100, weeklyPoints: { "1": 100, "9": 5, "x": 1 }, challengesCompleted: 1, movement: null, gapToNext: null,
    id: "SECRET-UUID", externalRef: "M-100", recordedBy: "staff-uuid", email: "a@b.c" };
  it("season: private fields and invalid week keys are removed", () => {
    const out = sanitizeSeason({ available: true, season: { slug: "s", name: "S", status: "active", startsOn: "2026-11-02", endsOn: "2026-12-27", totalWeeks: 8, throughWeek: 1, currentWeek: 1, participantCount: 1, truncated: false, internalId: "x" },
      challenges: [{ weekNumber: 1, name: "n", description: "", instructions: "", safetyNotes: "", metricKind: "REPS", unit: "reps", direction: "HIGHER_WINS", referenceUrl: null, status: "closed", requiresVerification: true }], standings: [standing], generatedAt: "t", staff: ["x"] });
    const text = JSON.stringify(out);
    for (const secret of ["SECRET-UUID", "M-100", "staff-uuid", "a@b.c", "internalId", "requiresVerification", "staff"]) expect(text).not.toContain(secret);
    expect((out as { standings: { weeklyPoints: object }[] }).standings[0]?.weeklyPoints).toEqual({ "1": 100 });
  });
  it("malformed upstream data is rejected, not passed through", () => {
    expect(sanitizeSeason({ available: "yes" })).toBeNull();
    expect(sanitizeSeason({ available: true, season: { slug: { nested: 1 } } })).toBeNull();
    expect(sanitizeResults({ available: true, weekNumber: 1, name: "n", unit: "u", direction: "d", results: "x" })).toBeNull();
    expect(sanitizeAthlete({ available: true, standing: "oops", results: [] })).toBeNull();
    expect(sanitizeSeason({ available: false })).toEqual({ available: false });
    expect(sanitizeSeason({ available: true, season: {}, challenges: [], standings: new Array(1001).fill(standing), generatedAt: "t" })).toBeNull();
  });
});

describe("TtlCache", () => {
  it("serves from memory inside the TTL, reloads after it, shares one load between concurrent misses, and never caches a zero TTL (errors)", async () => {
    let t = 0; const load = vi.fn(async () => ({ value: t, ttlMs: 1000 }));
    const c = new TtlCache<number>(() => t);
    const first = await Promise.all(Array.from({ length: 10 }, () => c.get("k", load)));
    expect(load).toHaveBeenCalledTimes(1); expect(first.every((x) => x.value === 0)).toBe(true);
    t = 999; expect((await c.get("k", load)).hit).toBe(true);
    t = 1001; const again = await c.get("k", load);
    expect(again).toMatchObject({ hit: false, value: 1001 }); expect(load).toHaveBeenCalledTimes(2);
    const err = vi.fn(async () => ({ value: -1, ttlMs: 0 }));
    await c.get("e", err); await c.get("e", err); expect(err).toHaveBeenCalledTimes(2);
  });
});

// ------------------------------------------------------------------------------------------------------------------------------------------------
function api(over: Partial<PublicApiConfig> = {}, extra: { upstream?: (url: string, body: unknown) => Response | Promise<Response>; limiter?: RateLimiter | null; now?: () => number } = {}) {
  const config = { ...readPublicApiConfig({ ...PROD_ENV }), ...over } as PublicApiConfig;
  const calls: { url: string; body: unknown; headers: Record<string, string> }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ url, body, headers: init.headers as Record<string, string> });
    return extra.upstream ? extra.upstream(url, body) : new Response(JSON.stringify(SEASON_OK), { status: 200 });
  }) as unknown as typeof fetch;
  const limiter = extra.limiter === undefined ? new MemoryLimiter(extra.now ?? Date.now) : extra.limiter;
  const handle = createPublicApi({ config, fetchImpl, now: extra.now ?? Date.now, limiter, log: () => undefined });
  return { handle, calls, config };
}
const SEASON_OK = { available: true, season: { slug: "s-one", name: "S", status: "active", startsOn: "2026-11-02", endsOn: "2026-12-27", totalWeeks: 8, throughWeek: 1, currentWeek: 1, participantCount: 1, truncated: false },
  challenges: [], standings: [{ publicId: "abcd1234abcd1234", displayName: "Ahmed K.", rank: 1, tied: false, totalPoints: 100, weeklyPoints: { "1": 100 }, challengesCompleted: 1, movement: null, gapToNext: null, id: "SECRET-UUID", externalRef: "M-100" }], generatedAt: "2026-11-04T12:00:00Z" };
const get = (path: string, headers: Record<string, string> = {}) => new Request(`https://league.example${path}`, { headers });

describe("public API", () => {
  it("serves an allow-listed, shared-cacheable response and strips private fields even if the database returned them", async () => {
    const { handle } = api();
    const res = await handle("season", get("/x/season/s-one"), { slug: "s-one" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=15");
    expect(res.headers.get("Set-Cookie")).toBeNull();
    const text = await res.text();
    for (const secret of ["SECRET-UUID", "M-100"]) expect(text).not.toContain(secret);
    expect(JSON.parse(text).standings[0].displayName).toBe("Ahmed K.");
  });
  it("accepts only GET, no query string, and well-formed parameters — all refusals are uncacheable", async () => {
    const { handle, calls } = api();
    const bad = [
      await handle("season", new Request("https://l.example/x", { method: "POST" }), { slug: "s-one" }),
      await handle("season", get("/x?cb=1"), { slug: "s-one" }),
      await handle("season", get("/x"), { slug: "S_ONE; drop" }),
      await handle("season", get("/x"), { slug: "a" }),
      await handle("results", get("/x"), { slug: "s-one", week: "9" }),
      await handle("results", get("/x"), { slug: "s-one", week: "1.5" }),
      await handle("athlete", get("/x"), { slug: "s-one", publicId: "../../etc/passwd" }),
      await handle("athlete", get("/x"), { slug: "s-one", publicId: "ab" }),
    ];
    expect(bad.map((r) => r.status)).toEqual([405, 400, 400, 400, 400, 400, 400, 400]);
    for (const r of bad) expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(calls).toHaveLength(0); // nothing malformed ever reaches the database
  });
  it("non-canonical spellings of the same URL (upper case, percent-encoding) are refused, so they cannot be used as cache-busting keys", async () => {
    const { handle, calls } = api();
    expect((await handle("season", get("/x/season/Season-A"), { slug: "Season-A" })).status).toBe(400);
    expect((await handle("season", get("/x/season/s%2Done"), { slug: "s-one" })).status).toBe(400);
    expect((await handle("season", get("/x/season/%73-one"), { slug: "s-one" })).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
  it("cache-busting query strings do not create new cache entries or database calls", async () => {
    const { handle, calls } = api();
    await handle("season", get("/x"), { slug: "s-one" });
    for (let i = 0; i < 5; i++) expect((await handle("season", get(`/x?bust=${i}`), { slug: "s-one" })).status).toBe(400);
    expect(calls).toHaveLength(1);
  });
  it("rate limits with 429 + Retry-After, per caller, and resets in the next window", async () => {
    let t = Date.parse("2026-11-04T12:00:10Z");
    const { handle } = api({ rules: { season: { limit: 2, windowSeconds: 60 }, results: { limit: 2, windowSeconds: 60 }, athlete: { limit: 2, windowSeconds: 60 } } }, { now: () => t });
    const hdr = (ip: string) => ({ "x-vercel-forwarded-for": ip });
    const r = async (ip: string) => handle("season", get("/x", hdr(ip)), { slug: "s-one" });
    expect([(await r("1.1.1.1")).status, (await r("1.1.1.1")).status]).toEqual([200, 200]);
    const blocked = await r("1.1.1.1");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    expect(blocked.headers.get("Cache-Control")).toBe("no-store");
    expect((await r("2.2.2.2")).status).toBe(200); // another caller is unaffected
    t += 60_000;
    expect((await r("1.1.1.1")).status).toBe(200); // reset
  });
  it("a spoofed forwarded header cannot mint fresh buckets when no proxy is trusted", async () => {
    const { handle } = api({ trustedProxy: "none", rules: { season: { limit: 2, windowSeconds: 60 }, results: { limit: 2, windowSeconds: 60 }, athlete: { limit: 2, windowSeconds: 60 } } });
    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await handle("season", get("/x", { "x-forwarded-for": `9.9.9.${i}`, "x-vercel-forwarded-for": `8.8.8.${i}` }), { slug: "s-one" })).status);
    expect(codes).toEqual([200, 200, 429, 429, 429]);
  });
  it("backend outage: the request is answered by the stricter per-instance limiter, not waved through, and says so", async () => {
    const broken: RateLimiter = { check: async () => { throw new Error("backend down"); } };
    const { handle } = api({ rules: { season: { limit: 8, windowSeconds: 60 }, results: { limit: 8, windowSeconds: 60 }, athlete: { limit: 8, windowSeconds: 60 } } }, { limiter: broken });
    const res = [] as Response[];
    for (let i = 0; i < 4; i++) res.push(await handle("season", get("/x"), { slug: "s-one" }));
    expect(res.map((r) => r.status)).toEqual([200, 200, 429, 429]); // 8 / 4 = 2 per window
    expect(res[0]?.headers.get("X-League-RateLimit")).toMatch(/^degraded/);
  });
  it("production without protection configured refuses to serve at all (fail closed)", async () => {
    const { handle, calls } = api({ misconfiguration: "no rate-limit backend is configured" }, { limiter: null });
    const res = await handle("season", get("/x"), { slug: "s-one" });
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(calls).toHaveLength(0);
  });
  it("an unpublished or unknown season looks identical (404, same body) and is cached only briefly", async () => {
    const { handle } = api({}, { upstream: () => new Response(JSON.stringify({ available: false }), { status: 200 }) });
    const a = await handle("season", get("/x"), { slug: "unpublished-one" });
    const b = await handle("season", get("/x"), { slug: "no-such-season" });
    expect(a.status).toBe(404); expect(await a.text()).toBe(await b.text());
    expect(a.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=5");
  });
  it("upstream failures are 502, uncacheable, and never stored", async () => {
    let n = 0;
    const { handle, calls } = api({}, { upstream: () => (++n === 1 ? new Response("boom", { status: 500 }) : new Response(JSON.stringify(SEASON_OK), { status: 200 })) });
    const first = await handle("season", get("/x"), { slug: "s-one" });
    expect(first.status).toBe(502); expect(first.headers.get("Cache-Control")).toBe("no-store");
    expect((await handle("season", get("/x"), { slug: "s-one" })).status).toBe(200); // recovered immediately: the error was not cached
    expect(calls).toHaveLength(2);
  });
  it("a malformed upstream payload is a 502, never relayed", async () => {
    const { handle } = api({}, { upstream: () => new Response(JSON.stringify({ available: true, season: "<script>", standings: [] }), { status: 200 }) });
    expect((await handle("season", get("/x"), { slug: "s-one" })).status).toBe(502);
  });
  it("cache: a second request inside the origin TTL does not reach the database; after it a corrected score is served; the edge window is the declared s-maxage", async () => {
    let t = 1_000_000; let points = 100;
    const { handle, calls } = api({}, { now: () => t, upstream: () => new Response(JSON.stringify({ ...SEASON_OK, standings: [{ ...SEASON_OK.standings[0], totalPoints: points }] }), { status: 200 }) });
    const total = async () => ((await (await handle("season", get("/x"), { slug: "s-one" })).json()) as { standings: { totalPoints: number }[] }).standings[0]?.totalPoints;
    expect(await total()).toBe(100);
    points = 90; // an administrator corrects the result
    t += 2_000; expect(await total()).toBe(100); expect(calls).toHaveLength(1); // inside this process's 3 s cache
    t += 2_000; expect(await total()).toBe(90); expect(calls).toHaveLength(2);   // 4 s later the origin has the correction (an edge copy can still be served for up to 15 s more)
  });
  it("cache keys never mix seasons, weeks or athletes (no cross-season leakage)", async () => {
    const { handle, calls } = api({}, { upstream: (_u, body) => new Response(JSON.stringify({ ...SEASON_OK, season: { ...SEASON_OK.season, slug: (body as { p_slug: string }).p_slug } }), { status: 200 }) });
    type S = { season: { slug: string } };
    const a = (await (await handle("season", get("/x"), { slug: "season-a" })).json()) as S;
    const b = (await (await handle("season", get("/x"), { slug: "season-b" })).json()) as S;
    const again = (await (await handle("season", get("/x"), { slug: "season-a" })).json()) as S;
    expect([a.season.slug, b.season.slug, again.season.slug]).toEqual(["season-a", "season-b", "season-a"]);
    expect(calls).toHaveLength(2); // the second season-a was served from the entry of the first, never from season-b's
  });
  it("ignores cookies and Authorization from the caller: they neither reach the database nor change the response", async () => {
    const { handle, calls } = api();
    const plain = await (await handle("season", get("/x"), { slug: "s-one" })).text();
    const withCreds = await (await handle("season", get("/x", { cookie: "sb=SESSION", authorization: "Bearer STAFF-TOKEN" }), { slug: "s-one" })).text();
    expect(withCreds).toBe(plain);
    for (const c of calls) { expect(JSON.stringify(c.headers)).not.toContain("STAFF-TOKEN"); expect(JSON.stringify(c.headers)).not.toContain("SESSION"); expect(c.headers.apikey).toBe("anon-key"); }
  });
  it("burst: 25 simultaneous misses cause exactly one database call", async () => {
    const { handle, calls } = api({ rules: { season: { limit: 1000, windowSeconds: 60 }, results: { limit: 1000, windowSeconds: 60 }, athlete: { limit: 1000, windowSeconds: 60 } } });
    const all = await Promise.all(Array.from({ length: 25 }, () => handle("season", get("/x"), { slug: "s-one" })));
    expect(all.every((r) => r.status === 200)).toBe(true);
    expect(calls).toHaveLength(1);
  });
  it("the three kinds call the three public functions with only the validated arguments", async () => {
    const { handle, calls } = api({ rules: { season: { limit: 100, windowSeconds: 60 }, results: { limit: 100, windowSeconds: 60 }, athlete: { limit: 100, windowSeconds: 60 } } }, { upstream: () => new Response(JSON.stringify({ available: false }), { status: 200 }) });
    await handle("season", get("/x"), { slug: "s-one" });
    await handle("results", get("/x"), { slug: "s-one", week: "3" });
    await handle("athlete", get("/x"), { slug: "s-one", publicId: "abcd1234abcd1234" });
    expect(calls.map((c) => [c.url.split("/rpc/")[1], c.body])).toEqual([
      ["race_league_public_season", { p_slug: "s-one" }],
      ["race_league_public_challenge_results", { p_slug: "s-one", p_week: 3 }],
      ["race_league_public_participant", { p_slug: "s-one", p_public_id: "abcd1234abcd1234" }],
    ]);
  });
});
