/**
 * Client-side view of the authoritative server race clock.
 *
 * The server owns time. A device only ESTIMATES it: it measures its offset to the server clock (keeping the
 * lowest-round-trip samples, since a fast round trip bounds the error), then extrapolates with a monotonic
 * local timer. A pause freezes the estimate; any change of clock `version` forces a re-sync. Nothing here ever
 * decides an official time — the server stamps those.
 */

export interface ClockSample {
  /** Local monotonic ms when the request was sent. */
  sentAt: number;
  /** Local monotonic ms when the response arrived. */
  receivedAt: number;
  /** Server wall-clock ms (epoch) carried in the response. */
  serverEpochMs: number;
}

export interface OffsetEstimate {
  /** serverEpochMs ≈ localMonotonicMs + offsetMs */
  offsetMs: number;
  /** Worst-case error of the estimate (half the best round trip). */
  uncertaintyMs: number;
  samples: number;
}

/** Best estimate from up to `keep` lowest-RTT samples (median of their offsets). Null if there are none. */
export function estimateOffset(samples: readonly ClockSample[], keep = 5): OffsetEstimate | null {
  const usable = samples.filter((s) => s.receivedAt >= s.sentAt);
  if (usable.length === 0) return null;
  const best = [...usable].sort((a, b) => a.receivedAt - a.sentAt - (b.receivedAt - b.sentAt)).slice(0, keep);
  const offsets = best
    .map((s) => s.serverEpochMs - (s.sentAt + s.receivedAt) / 2)
    .sort((a, b) => a - b);
  const mid = Math.floor(offsets.length / 2);
  const median = offsets.length % 2 === 1 ? offsets[mid]! : (offsets[mid - 1]! + offsets[mid]!) / 2;
  const bestRtt = best[0]!.receivedAt - best[0]!.sentAt;
  return { offsetMs: median, uncertaintyMs: bestRtt / 2, samples: usable.length };
}

/** The clock facts the server sent with a snapshot. */
export interface ClockSnapshot {
  started: boolean;
  paused: boolean;
  finished: boolean;
  /** Race ms at `serverEpochMs` (frozen value when paused). Null before START EVENT. */
  raceMs: number | null;
  version: number;
  /** Server epoch ms at which the snapshot was taken. */
  serverEpochMs: number;
}

/**
 * Race time now, extrapolated from a snapshot. Never negative, never moves while paused/finished,
 * and never goes backwards between two calls with non-decreasing `localNow`.
 */
export function raceMsNow(snapshot: ClockSnapshot, offset: OffsetEstimate, localNow: number): number | null {
  if (!snapshot.started || snapshot.raceMs === null) return null;
  if (snapshot.paused || snapshot.finished) return snapshot.raceMs;
  const serverNow = localNow + offset.offsetMs;
  return Math.max(snapshot.raceMs, snapshot.raceMs + (serverNow - snapshot.serverEpochMs));
}

/** Whether a fresher snapshot means this device must discard its extrapolation and re-sync. */
export function needsResync(current: ClockSnapshot | null, incoming: ClockSnapshot, offset: OffsetEstimate | null, staleAfterMs = 30_000): boolean {
  if (current === null || offset === null) return true;
  if (incoming.version !== current.version) return true;
  return incoming.serverEpochMs - current.serverEpochMs > staleAfterMs;
}
