import { describe, expect, it } from "vitest";
import { DEFAULT_TIMING, finishMs, formatCountdown, formatRaceClock, slotStartMs, stationPhase, stationWindow } from "./timeline";

// Pinned to the SQL model: supabase/tests/race/tests/14_engine.sql ("windows: all 9 stations") and the 50-athlete simulation.
describe("stationWindow (mirrors race_station_window)", () => {
  it("gives the 9 windows of the first athlete (start 0:01:00)", () => {
    const got = Array.from({ length: 9 }, (_, i) => {
      const w = stationWindow(60_000, i + 1);
      return `${i + 1}:${w.startMs}-${w.endMs}`;
    });
    expect(got).toEqual([
      "1:60000-240000", "2:270000-450000", "3:480000-660000", "4:690000-870000", "5:900000-1080000",
      "6:1110000-1290000", "7:1320000-1500000", "8:1530000-1710000", "9:1740000-1920000",
    ]);
  });
  it("scoring window is exactly 0:30 after the work window", () => {
    expect(stationWindow(60_000, 1).scoringEndMs).toBe(270_000);
  });
  it("the next athlete takes over a station exactly when the previous one's scoring window ends", () => {
    const first = stationWindow(slotStartMs(60_000, 0), 4);
    const second = stationWindow(slotStartMs(60_000, 1), 4);
    expect(second.startMs).toBe(first.scoringEndMs);
  });
  it("finish = start + 8 × 3:30 + 3:00 = start + 31:00", () => {
    expect(finishMs(60_000)).toBe(60_000 + 31 * 60_000);
  });
  it("heat anchors of the 50-athlete event (9,9,9,9,9,5) follow anchor + (N-1)·3:30 + 10:00", () => {
    const anchors = [60_000];
    for (const size of [9, 9, 9, 9, 9]) anchors.push(anchors.at(-1)! + (size - 1) * DEFAULT_TIMING.startIntervalMs + 600_000);
    expect(anchors.slice(0, 6)).toEqual([60_000, 2_340_000, 4_620_000, 6_900_000, 9_180_000, 11_460_000]);
  });
});

describe("stationPhase — exact boundaries, no grace period", () => {
  const w = stationWindow(60_000, 1);
  it.each([
    [59_999, "SCHEDULED"],
    [60_000, "WORK"],
    [239_999, "WORK"],
    [240_000, "SCORING"],
    [269_999, "SCORING"],
    [270_000, "LOCKED"],
  ] as const)("at %i ms → %s", (t, phase) => expect(stationPhase(w, t)).toBe(phase));
});

describe("formatters", () => {
  it("formats countdowns, rounding up so it never shows 0:00 early", () => {
    expect(formatCountdown(59_001)).toBe("1:00");
    expect(formatCountdown(59_000)).toBe("0:59");
    expect(formatCountdown(1)).toBe("0:01");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-500)).toBe("0:00");
  });
  it("formats the race clock, rounding down so it never runs ahead of the server", () => {
    expect(formatRaceClock(999)).toBe("0:00");
    expect(formatRaceClock(60_000)).toBe("1:00");
    expect(formatRaceClock(3_599_999)).toBe("59:59");
    expect(formatRaceClock(3_600_000)).toBe("1:00:00");
    expect(formatRaceClock(14_400_000)).toBe("4:00:00");
  });
});
