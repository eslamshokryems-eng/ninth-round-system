/**
 * A tiny in-process cache with single-flight: concurrent misses for the same key share ONE upstream call. It protects one server instance from a burst; it is not
 * the edge cache and it never holds an entry longer than its TTL, so it cannot extend the documented consistency window. Errors are never cached.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expires: number }>();
  private readonly inflight = new Map<string, Promise<{ value: T; ttlMs: number }>>();
  constructor(private readonly now: () => number = Date.now, private readonly maxEntries = 500) {}

  async get(key: string, load: () => Promise<{ value: T; ttlMs: number }>): Promise<{ value: T; hit: boolean }> {
    const hit = this.entries.get(key);
    if (hit && hit.expires > this.now()) return { value: hit.value, hit: true };
    if (hit) this.entries.delete(key);
    let p = this.inflight.get(key);
    if (!p) {
      p = load().finally(() => this.inflight.delete(key));
      this.inflight.set(key, p);
    }
    const { value, ttlMs } = await p;
    if (ttlMs > 0) {
      if (this.entries.size >= this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
      this.entries.set(key, { value, expires: this.now() + ttlMs });
    }
    return { value, hit: false };
  }
  get size(): number { return this.entries.size; }
}
