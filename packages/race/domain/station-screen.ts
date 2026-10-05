/**
 * The Station Screen state machine — a PURE function of (authoritative data, race time).
 *
 *   deriveScreenState(data, raceMs) → WAITING | GET_READY | WORK | TRANSITION | NEXT_ATHLETE | PAUSED | FINISHED
 *
 * The device owns nothing: no timer state, no history, no "current phase" variable. Whatever it shows now is recomputed from the last
 * authoritative answer and an estimate of race time. So a screen that was offline for 30 s, or was just plugged in, computes exactly the
 * state a screen that never lost its connection computes — there is nothing to resume, restart or repair.
 */

export interface StationScreenData {
  serverTime: string;
  eventName: string;
  station: { number: number; name: string; isLast: boolean };
  clock: { started: boolean; paused: boolean; finished: boolean; raceMs: number | null; version: number };
  timing: { workMs: number; transitionMs: number; getReadyMs: number };
  current: {
    raceNumber: string;
    categoryCode: string;
    windowStartMs: number;
    windowEndMs: number;
    scoringEndMs: number;
    scoringType: string | null;
    score: number | null;
  } | null;
  upcoming: { raceNumber: string; categoryCode: string; windowStartMs: number } | null;
  plannedNextMs: number | null;
  servedAny: boolean;
}

export type ScoreUnit = "REPS" | "LAPS" | "SEC" | "M";

export interface NextAthlete {
  raceNumber: string;
  categoryCode: string;
  startsInMs: number;
}

export type ScreenState =
  | { kind: "WAITING"; next: NextAthlete | null; plannedInMs: number | null; raceStarted: boolean }
  | { kind: "GET_READY"; raceNumber: string; categoryCode: string; startsInMs: number }
  /** `score` is null at the rowing station: its distance is read from the display photo after the 3:00, there is no live count. */
  | { kind: "WORK"; raceNumber: string; categoryCode: string; remainingMs: number; score: number | null; unit: ScoreUnit; then: NextAthlete | null }
  /** `finalScore` is null while a rowing distance is still PENDING EVIDENCE (not yet confirmed by the judge). */
  | { kind: "TRANSITION"; raceNumber: string; finalScore: number | null; unit: ScoreUnit; remainingMs: number; moveTo: number | null; then: NextAthlete | null }
  | { kind: "NEXT_ATHLETE"; next: NextAthlete | null; plannedInMs: number | null }
  | { kind: "PAUSED" }
  | { kind: "FINISHED" };

export function scoreUnit(scoringType: string | null): ScoreUnit {
  if (scoringType === "LAPS") return "LAPS";
  if (scoringType === "HOLD_MS") return "SEC";
  if (scoringType === "DISTANCE_M") return "M";
  return "REPS";
}

/** What the big number shows: reps and laps as they are, a hold in whole seconds (rounded down — a hold never shows time it has not lasted). */
export function displayScore(score: number | null, unit: ScoreUnit): number {
  if (score === null) return 0;
  return unit === "SEC" ? Math.floor(score / 1000) : Math.floor(score);
}

function next(data: StationScreenData, raceMs: number): NextAthlete | null {
  return data.upcoming ? { raceNumber: data.upcoming.raceNumber, categoryCode: data.upcoming.categoryCode, startsInMs: data.upcoming.windowStartMs - raceMs } : null;
}

export function deriveScreenState(data: StationScreenData, raceMs: number | null): ScreenState {
  if (!data.clock.started || raceMs === null) return { kind: "WAITING", next: null, plannedInMs: null, raceStarted: false };
  if (data.clock.finished) return { kind: "FINISHED" };
  if (data.clock.paused) return { kind: "PAUSED" };

  const nxt = next(data, raceMs);
  const c = data.current;
  if (c) {
    const unit = scoreUnit(c.scoringType);
    if (raceMs < c.windowEndMs) {
      return { kind: "WORK", raceNumber: c.raceNumber, categoryCode: c.categoryCode, remainingMs: Math.max(c.windowEndMs - raceMs, 0), score: unit === "M" ? null : displayScore(c.score, unit), unit, then: nxt };
    }
    if (raceMs < c.scoringEndMs) {
      return {
        kind: "TRANSITION",
        raceNumber: c.raceNumber,
        finalScore: unit === "M" && c.score === null ? null : displayScore(c.score, unit),
        unit,
        remainingMs: Math.max(c.scoringEndMs - raceMs, 0),
        moveTo: data.station.isLast ? null : data.station.number + 1,
        then: nxt,
      };
    }
    // the window has ended since the answer was taken: the next answer will name whoever is here now — until then show the gap
  }
  const plannedInMs = data.plannedNextMs !== null ? data.plannedNextMs - raceMs : null;
  if (nxt) {
    if (nxt.startsInMs <= data.timing.getReadyMs) return { kind: "GET_READY", raceNumber: nxt.raceNumber, categoryCode: nxt.categoryCode, startsInMs: Math.max(nxt.startsInMs, 0) };
    return data.servedAny ? { kind: "NEXT_ATHLETE", next: nxt, plannedInMs } : { kind: "WAITING", next: nxt, plannedInMs, raceStarted: true };
  }
  return data.servedAny ? { kind: "NEXT_ATHLETE", next: null, plannedInMs } : { kind: "WAITING", next: null, plannedInMs, raceStarted: true };
}
