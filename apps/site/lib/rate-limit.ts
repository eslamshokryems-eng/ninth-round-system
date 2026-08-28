/**
 * Minimal in-memory rate limiter for the trial API route.
 *
 * This is a per-instance fallback so the endpoint is never unprotected. It
 * is NOT a substitute for a shared store in production — the internal
 * platform already depends on Upstash Redis, and the same
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN should back this before
 * launch (see the deployment notes in README.md). Swapping the
 * implementation here does not touch any page or component.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

export function rateLimit(key: string): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfter: 0 };
  }

  if (existing.count >= MAX_PER_WINDOW) {
    return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }

  existing.count += 1;
  return { ok: true, retryAfter: 0 };
}

// Opportunistic cleanup so the map can't grow unbounded on a long-lived instance.
export function sweep(): void {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (v.resetAt < now) buckets.delete(k);
  }
}
