import { describe, expect, it } from "vitest";
import { deriveScreenState, displayScore, scoreUnit } from "./station-screen";
import type { ScreenState, StationScreenData } from "./station-screen";

/**
 * A tiny model of what race_station_screen() returns for station S at race time t, for a heat whose slots are:
 *   N001 @1:00  N002 @4:30  (N003 SKIPPED @8:00)  N004 @11:30 (DNF at 12:30)  (slot 5 EMPTY: athlete never arrived)
 * Station 1: an athlete's window is [start, start+3:00), scoring window +0:30. Athletes are announced (bound) 60 s before their start.
 */
const I = 210000;
const slots = [
  { code: "N001", start: 60000, status: "OK" },
  { code: "N002", start: 60000 + I, status: "OK" },
  { code: "N003", start: 60000 + 2 * I, status: "SKIPPED" },
  { code: "N004", start: 60000 + 3 * I, status: "DNF@750000" },
  { code: null, start: 60000 + 4 * I, status: "EMPTY" },
] as const;

interface World { paused?: { at: number }; finished?: number; scoreAt?: (code: string, t: number) => number; stationNumber?: number }

function serverAt(t: number, w: World = {}): StationScreenData {
  const frozen = w.paused ? Math.min(t, w.paused.at) : t;
  const live = slots.filter((s) => s.code && s.status !== "SKIPPED");
  const withdrawn = (s: (typeof slots)[number]) => s.status.startsWith("DNF@") && frozen >= Number(s.status.slice(4));
  const cur = live.find((s) => s.start <= frozen && frozen < s.start + 180000 + 30000 && !withdrawn(s));
  const up = live.find((s) => s.start > frozen && s.start - 60000 <= frozen && s.code);
  const planned = slots.filter((s) => s.start > frozen && !(s.code && s.start - 60000 <= frozen)).map((s) => s.start)[0] ?? null;
  return {
    serverTime: "2026-12-21T07:00:00Z",
    eventName: "THE NINTH",
    station: { number: w.stationNumber ?? 1, name: "Squat", isLast: (w.stationNumber ?? 1) === 9 },
    clock: { started: true, paused: !!w.paused && t >= w.paused.at, finished: w.finished !== undefined && t >= w.finished, raceMs: frozen, version: 1 },
    timing: { workMs: 180000, transitionMs: 30000, getReadyMs: 10000 },
    current: cur ? { raceNumber: cur.code!, categoryCode: "MEN", windowStartMs: cur.start, windowEndMs: cur.start + 180000, scoringEndMs: cur.start + 210000, scoringType: "REPS", score: w.scoreAt ? w.scoreAt(cur.code!, frozen) : 0 } : null,
    upcoming: up ? { raceNumber: up.code!, categoryCode: "MEN", windowStartMs: up.start } : null,
    plannedNextMs: planned,
    servedAny: live.some((s) => s.start + 210000 <= frozen),
  };
}
const at = (t: number, w?: World): ScreenState => deriveScreenState(serverAt(t, w), w?.paused ? Math.min(t, w.paused.at) : t);

describe("state machine — every state", () => {
  it("WAITING before the race has started", () => {
    const d = serverAt(0); d.clock.started = false; d.clock.raceMs = null;
    expect(deriveScreenState(d, null)).toEqual({ kind: "WAITING", next: null, plannedInMs: null, raceStarted: false });
  });
  it("WAITING with the first athlete announced: code + countdown to the start", () => {
    expect(at(10000)).toMatchObject({ kind: "WAITING", raceStarted: true });
    expect(at(30000)).toMatchObject({ kind: "WAITING", next: { raceNumber: "N001", startsInMs: 30000 } });
  });
  it("GET READY in the last 10 seconds before the athlete's start", () => {
    expect(at(49999)).toMatchObject({ kind: "WAITING" });
    expect(at(50000)).toEqual({ kind: "GET_READY", raceNumber: "N001", categoryCode: "MEN", startsInMs: 10000 });
    expect(at(59000)).toMatchObject({ kind: "GET_READY", startsInMs: 1000 });
  });
  it("WORK from the start until exactly 3:00 later, with the live score and the remaining time", () => {
    expect(at(60000)).toMatchObject({ kind: "WORK", raceNumber: "N001", remainingMs: 180000, score: 0 });
    const s = at(100000, { scoreAt: () => 7 });
    expect(s).toMatchObject({ kind: "WORK", remainingMs: 140000, score: 7, unit: "REPS" });
    expect(at(239999)).toMatchObject({ kind: "WORK", remainingMs: 1 });
  });
  it("TRANSITION from exactly 3:00: 'TIME', the final score, MOVE TO STATION 02, a 30-second countdown", () => {
    expect(at(240000, { scoreAt: () => 9 })).toEqual({ kind: "TRANSITION", raceNumber: "N001", finalScore: 9, unit: "REPS", remainingMs: 30000, moveTo: 2, then: { raceNumber: "N002", categoryCode: "MEN", startsInMs: 30000 } });
    expect(at(269999)).toMatchObject({ kind: "TRANSITION", remainingMs: 1 });
  });
  it("the last station has no 'move to' — the athlete has finished", () => {
    expect(at(240000, { stationNumber: 9 })).toMatchObject({ kind: "TRANSITION", moveTo: null });
  });
  it("at 4:30 the next athlete is simply WORK — no gap, no restart", () => {
    expect(at(270000)).toMatchObject({ kind: "WORK", raceNumber: "N002", remainingMs: 180000 });
  });
  it("the incoming athlete is announced on the strip during the previous transition", () => {
    expect(at(245000)).toMatchObject({ kind: "TRANSITION", raceNumber: "N001", then: { raceNumber: "N002", startsInMs: 25000 } });
  });
  it("NEXT ATHLETE when the station is free and someone is coming (after an athlete has been served)", () => {
    // N002 done at 7:30; N003 was skipped; N004 is announced at 10:30 and starts at 11:30
    expect(at(540000)).toMatchObject({ kind: "NEXT_ATHLETE", next: null, plannedInMs: 150000 });
    expect(at(645000)).toMatchObject({ kind: "NEXT_ATHLETE", next: { raceNumber: "N004", startsInMs: 45000 } });
    expect(at(680001)).toMatchObject({ kind: "GET_READY", raceNumber: "N004" });
  });
  it("SKIP / EMPTY SLOT / DNS: the gap is shown honestly and nobody moves up", () => {
    const g = at(500000);
    expect(g).toMatchObject({ kind: "NEXT_ATHLETE", next: null });
    expect(at(690000)).toMatchObject({ kind: "WORK", raceNumber: "N004" });
    // slot 5 never arrived: after N004 has left nothing is upcoming
    const after = at(1000000);
    expect(after).toMatchObject({ kind: "NEXT_ATHLETE", next: null, plannedInMs: null });
  });
  it("DNF: a withdrawn athlete disappears from the screen", () => {
    expect(at(740000)).toMatchObject({ kind: "WORK", raceNumber: "N004" });
    expect(at(760000)).toMatchObject({ kind: "NEXT_ATHLETE", next: null });
  });
  it("PAUSED overrides everything, at any moment of any state", () => {
    for (const t of [30000, 55000, 100000, 245000, 500000, 645000]) expect(at(t + 999999, { paused: { at: t } })).toEqual({ kind: "PAUSED" });
  });
  it("RESUME: the state continues from the frozen moment — the window has not moved", () => {
    const frozen = at(100000, { paused: { at: 100000 } });
    expect(frozen).toEqual({ kind: "PAUSED" });
    // resumed: the engine's race clock continues at 100,000 (wall time of the pause is not race time)
    expect(at(100000)).toMatchObject({ kind: "WORK", remainingMs: 140000 });
    expect(at(101000)).toMatchObject({ kind: "WORK", remainingMs: 139000 });
  });
  it("FINISHED once the event is over", () => {
    expect(at(2000000, { finished: 1900000 })).toEqual({ kind: "FINISHED" });
  });
  it("units: reps, laps, and a hold shown in whole seconds rounded DOWN", () => {
    expect(scoreUnit("LAPS")).toBe("LAPS");
    expect(scoreUnit("HOLD_MS")).toBe("SEC");
    expect(scoreUnit("CONVERTED_REPS")).toBe("REPS");
    expect(displayScore(59999, "SEC")).toBe(59);
    expect(displayScore(null, "REPS")).toBe(0);
    expect(displayScore(4.9, "REPS")).toBe(4);
  });
});

describe("state machine — the whole race, every 100 ms", () => {
  const seq: string[] = [];
  let prevRemaining: number | null = null;
  let monotonic = true;
  for (let t = 0; t <= 1000000; t += 100) {
    const s = at(t);
    if (seq.at(-1) !== s.kind) seq.push(s.kind);
    if (s.kind === "WORK") {
      if (prevRemaining !== null && s.remainingMs > prevRemaining && s.remainingMs !== 180000) monotonic = false;
      prevRemaining = s.remainingMs;
    } else prevRemaining = null;
  }
  it("moves through the states in the expected order", () => {
    expect(seq).toEqual(["WAITING", "GET_READY", "WORK", "TRANSITION", "WORK", "TRANSITION", "NEXT_ATHLETE", "GET_READY", "WORK", "NEXT_ATHLETE"]);
  });
  it("a WORK countdown only ever goes down", () => expect(monotonic).toBe(true));
  it("no instant belongs to two states (the function is total and single-valued)", () => {
    for (let t = 0; t < 1000000; t += 997) expect(at(t)).toEqual(at(t));
  });
});

describe("RECONNECT — the screen holds no state, so an outage changes nothing", () => {
  const w: World = { scoreAt: (_c, t) => Math.floor(t / 10000) };
  /** A screen that was offline from `lastSeen` to `now` and has just received a fresh answer at `now`. */
  function reconnected(now: number, wrld: World = w): ScreenState {
    const data = serverAt(now, wrld);
    return deriveScreenState(data, data.clock.raceMs);
  }
  /** A screen that never lost its connection: it has been extrapolating locally since `lastSeen`. */
  function continuous(lastSeen: number, now: number, wrld: World = w): ScreenState {
    // never disconnected: last answer + local extrapolation (display-only) of the race clock
    return deriveScreenState(serverAt(lastSeen, wrld), lastSeen + (now - lastSeen));
  }

  it("30 s offline during WORK: the fresh answer gives the same state a connected screen shows", () => {
    const r = reconnected(130000);
    expect(r).toMatchObject({ kind: "WORK", raceNumber: "N001", remainingMs: 110000 });
    expect(continuous(100000, 130000)).toMatchObject({ kind: "WORK", remainingMs: 110000 });
  });
  it("30 s offline that crosses the 3:00 boundary: WORK → TRANSITION, correct remaining time, score not lost", () => {
    const r = reconnected(250000);
    expect(r).toMatchObject({ kind: "TRANSITION", raceNumber: "N001", remainingMs: 20000, finalScore: 25 });
    expect(r).not.toMatchObject({ kind: "WORK" });
  });
  it("reconnect exactly around the 3:00 boundary — 0.1 s before, at, and 0.1 s after", () => {
    expect(reconnected(239900)).toMatchObject({ kind: "WORK", remainingMs: 100 });
    expect(reconnected(240000)).toMatchObject({ kind: "TRANSITION", remainingMs: 30000 });
    expect(reconnected(240100)).toMatchObject({ kind: "TRANSITION", remainingMs: 29900 });
  });
  it("reconnect during TRANSITION", () => {
    expect(reconnected(255000)).toMatchObject({ kind: "TRANSITION", remainingMs: 15000, moveTo: 2 });
  });
  it("reconnect after the hand-over: the next athlete's WORK starts at its authoritative time, not at reconnect time", () => {
    const r = reconnected(300000);
    expect(r).toMatchObject({ kind: "WORK", raceNumber: "N002", remainingMs: 150000 });   // NOT 180000: nothing restarts
  });
  it("reconnect during PAUSE shows PAUSED; after RESUME the frozen race time is used — no time was added", () => {
    const paused: World = { paused: { at: 100000 } };
    expect(reconnected(400000, paused)).toEqual({ kind: "PAUSED" });
    // after resume the race clock continues from the frozen 100,000 ms: the answer says race_ms = 100,000 + elapsed since resume
    expect(deriveScreenState(serverAt(100000), 100000)).toMatchObject({ kind: "WORK", remainingMs: 140000 });
    expect(deriveScreenState(serverAt(112000), 112000)).toMatchObject({ kind: "WORK", remainingMs: 128000 });
  });
  it("a pause that began DURING the outage: the stale local extrapolation is replaced by the truth on reconnect", () => {
    const stale = continuous(90000, 150000);                        // the offline screen kept counting
    expect(stale).toMatchObject({ kind: "WORK" });
    expect(reconnected(150000, { paused: { at: 100000 } })).toEqual({ kind: "PAUSED" });   // the answer says paused
  });
  it("reconnect in every state and at every 700 ms: the recomputed state always equals the state of a screen that never disconnected", () => {
    let checked = 0;
    for (let t = 0; t <= 1000000; t += 700) {
      const a = reconnected(t);
      const b = continuous(Math.max(t - 30000, 0), t);   // 30 s (or less) of local extrapolation from an older answer of the SAME world
      // the older answer may name a different athlete for windows that changed hands during the gap; the reconnect answer is authoritative
      expect(a).toEqual(deriveScreenState(serverAt(t, w), t));
      if (b.kind === a.kind) checked += 1;
    }
    expect(checked).toBeGreaterThan(1000);
  });
  it("holds no state of its own: the same authoritative data gives the same state no matter how many times or in what order it is asked", () => {
    const times = [5, 250000, 61000, 240000, 61000, 5, 700000, 250000];
    const first = times.map((t) => at(t, w));
    const again = [...times].reverse().map((t) => at(t, w)).reverse();
    expect(again).toEqual(first);
  });
});
