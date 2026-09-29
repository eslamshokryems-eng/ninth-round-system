import { describe, expect, it } from "vitest";
import { estimateOffset, needsResync, raceMsNow } from "./race-clock";
import type { ClockSnapshot, OffsetEstimate } from "./race-clock";

const offset = (offsetMs: number): OffsetEstimate => ({ offsetMs, uncertaintyMs: 5, samples: 5 });
const snap = (o: Partial<ClockSnapshot> = {}): ClockSnapshot => ({
  started: true, paused: false, finished: false, raceMs: 100_000, version: 1, serverEpochMs: 1_000_000, ...o,
});

describe("estimateOffset", () => {
  it("returns null with no usable samples", () => {
    expect(estimateOffset([])).toBeNull();
    expect(estimateOffset([{ sentAt: 10, receivedAt: 5, serverEpochMs: 1 }])).toBeNull();
  });
  it("assumes the server stamped mid-flight", () => {
    // sent 1000, received 1100 (RTT 100), server said 5050 → server time at local 1050 was 5050 → offset 4000
    const e = estimateOffset([{ sentAt: 1000, receivedAt: 1100, serverEpochMs: 5050 }])!;
    expect(e.offsetMs).toBe(4000);
    expect(e.uncertaintyMs).toBe(50);
  });
  it("trusts the fastest round trips and ignores a slow outlier", () => {
    const fast = [10, 12, 11, 13, 10].map((rtt, i) => ({ sentAt: i * 1000, receivedAt: i * 1000 + rtt, serverEpochMs: i * 1000 + rtt / 2 + 7000 }));
    const slow = { sentAt: 9000, receivedAt: 9900, serverEpochMs: 9000 + 7000 + 100 }; // 900 ms RTT, badly skewed reading
    const e = estimateOffset([...fast, slow], 5)!;
    expect(e.offsetMs).toBe(7000);
    expect(e.uncertaintyMs).toBe(5);
    expect(e.samples).toBe(6);
  });
});

describe("raceMsNow", () => {
  it("is null before START EVENT", () => {
    expect(raceMsNow(snap({ started: false, raceMs: null }), offset(0), 5)).toBeNull();
  });
  it("extrapolates with the local timer", () => {
    // snapshot at server 1,000,000 says race 100,000; local now is 2,500 ms later in server terms
    expect(raceMsNow(snap(), offset(0), 1_002_500)).toBe(102_500);
    expect(raceMsNow(snap(), offset(500_000), 502_500)).toBe(102_500);
  });
  it("freezes while paused and after the finish", () => {
    expect(raceMsNow(snap({ paused: true }), offset(0), 9_999_999)).toBe(100_000);
    expect(raceMsNow(snap({ finished: true }), offset(0), 9_999_999)).toBe(100_000);
  });
  it("never runs backwards even if the local clock was corrected", () => {
    expect(raceMsNow(snap(), offset(0), 999_000)).toBe(100_000);
  });
  it("is monotonic for increasing local time", () => {
    let last = -1;
    for (let t = 1_000_000; t < 1_010_000; t += 137) {
      const v = raceMsNow(snap(), offset(3), t)!;
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
  });
});

describe("needsResync", () => {
  it("needs a sync when there is nothing to extrapolate from", () => {
    expect(needsResync(null, snap(), offset(0))).toBe(true);
    expect(needsResync(snap(), snap(), null)).toBe(true);
  });
  it("re-syncs when the server clock version changed (pause / resume / start / finish)", () => {
    expect(needsResync(snap(), snap({ version: 2 }), offset(0))).toBe(true);
  });
  it("re-syncs when the last snapshot is stale, otherwise not", () => {
    expect(needsResync(snap(), snap({ serverEpochMs: 1_010_000 }), offset(0))).toBe(false);
    expect(needsResync(snap(), snap({ serverEpochMs: 1_031_000 }), offset(0))).toBe(true);
  });
});
