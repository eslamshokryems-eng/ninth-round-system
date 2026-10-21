import type { RateRule } from "./config";

export interface LimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  /** Seconds until the current window ends (for Retry-After). */
  readonly resetSeconds: number;
}
export interface RateLimiter {
  check(key: string, rule: RateRule): Promise<LimitDecision>;
}

const windowOf = (nowMs: number, windowSeconds: number) => Math.floor(nowMs / 1000 / windowSeconds);
const untilReset = (nowMs: number, windowSeconds: number) => Math.max(1, windowSeconds - (Math.floor(nowMs / 1000) % windowSeconds));

/**
 * Fixed-window counter held in THIS process only. It protects one server instance. It is NOT a global limiter: with several instances (serverless
 * scale-out) each has its own counters. Used as the explicit "memory" backend, as the degraded fallback, and in tests.
 */
export class MemoryLimiter implements RateLimiter {
  private readonly counts = new Map<string, { window: number; n: number }>();
  constructor(private readonly now: () => number = Date.now, private readonly maxKeys = 10_000) {}
  async check(key: string, rule: RateRule): Promise<LimitDecision> {
    const nowMs = this.now();
    const w = windowOf(nowMs, rule.windowSeconds);
    const cur = this.counts.get(key);
    const n = cur && cur.window === w ? cur.n + 1 : 1;
    if (!cur && this.counts.size >= this.maxKeys) this.prune(w);
    this.counts.set(key, { window: w, n });
    return { allowed: n <= rule.limit, remaining: Math.max(0, rule.limit - n), resetSeconds: untilReset(nowMs, rule.windowSeconds) };
  }
  private prune(currentWindow: number) {
    for (const [k, v] of this.counts) if (v.window < currentWindow) this.counts.delete(k);
    if (this.counts.size >= this.maxKeys) this.counts.clear(); // memory safety valve: forgetting counters is bounded by one window
  }
}

/**
 * Distributed fixed-window counter on a Redis-compatible REST endpoint (Upstash / Vercel KV speak this protocol). One pipelined round trip:
 * INCR key, EXPIRE key window NX. No SDK, no dependency: just `fetch`. Throws on any failure so the caller can fail safe.
 */
export class RestRedisLimiter implements RateLimiter {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly timeoutMs = 800,
  ) {}
  async check(key: string, rule: RateRule): Promise<LimitDecision> {
    const nowMs = this.now();
    const redisKey = `league:rl:${key}:${windowOf(nowMs, rule.windowSeconds)}`;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.url.replace(/\/+$/, "")}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify([["INCR", redisKey], ["EXPIRE", redisKey, String(rule.windowSeconds + 5), "NX"]]),
        signal: ctl.signal,
        ...({ cache: "no-store" } as Record<string, unknown>), // never reuse a framework-level fetch cache for this call
      });
      if (!res.ok) throw new Error(`limiter backend answered ${res.status}`);
      const body = (await res.json()) as unknown;
      const first = Array.isArray(body) ? (body[0] as { result?: unknown; error?: unknown } | undefined) : undefined;
      if (!first || first.error !== undefined || typeof first.result !== "number" || !Number.isInteger(first.result) || first.result < 1) throw new Error("limiter backend answered with an unexpected shape");
      const n = first.result;
      return { allowed: n <= rule.limit, remaining: Math.max(0, rule.limit - n), resetSeconds: untilReset(nowMs, rule.windowSeconds) };
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface GuardedDecision extends LimitDecision {
  /** "primary" = the configured backend decided; "degraded" = it failed and the stricter per-instance fallback decided. */
  readonly mode: "primary" | "degraded";
}

/**
 * Never fails open. If the configured backend errors or times out, a STRICTER per-instance limiter (a quarter of the limit, at least 1) decides instead and
 * the response says so; an attacker cannot gain extra budget by breaking the backend. The failure is reported (without any client data) through `onFault`.
 */
export class GuardedLimiter {
  private readonly fallback: MemoryLimiter;
  constructor(private readonly primary: RateLimiter, now: () => number = Date.now, private readonly onFault: (message: string) => void = () => undefined) {
    this.fallback = new MemoryLimiter(now);
  }
  async check(key: string, rule: RateRule): Promise<GuardedDecision> {
    try {
      return { ...(await this.primary.check(key, rule)), mode: "primary" };
    } catch (e) {
      this.onFault(e instanceof Error ? e.message : "limiter backend failed");
      const strict: RateRule = { limit: Math.max(1, Math.floor(rule.limit / 4)), windowSeconds: rule.windowSeconds };
      return { ...(await this.fallback.check(`fallback:${key}`, strict)), mode: "degraded" };
    }
  }
}
