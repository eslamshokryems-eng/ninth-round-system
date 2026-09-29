/**
 * The race schedule is pure arithmetic — nothing "ticks". These helpers mirror the SQL
 * (race_station_window / race_advance_core) exactly and are pinned to it by fixtures in
 * timeline.test.ts. Used by screens to draw countdowns; the database remains the authority.
 */

export interface TimingConfig {
  startIntervalMs: number;
  workMs: number;
  transitionMs: number;
  stationCount: number;
}

export const DEFAULT_TIMING: TimingConfig = { startIntervalMs: 210_000, workMs: 180_000, transitionMs: 30_000, stationCount: 9 };

export interface StationWindow {
  startMs: number;
  endMs: number;
  /** End of the 0:30 scoring/hand-over window: the station is free for the next athlete from here. */
  scoringEndMs: number;
}

/** Start time of a slot. */
export function slotStartMs(anchorMs: number, slotIndex: number, cfg: TimingConfig = DEFAULT_TIMING): number {
  return anchorMs + slotIndex * cfg.startIntervalMs;
}

/** Window of station `station` (1-based) for the athlete who starts at `startMs`. */
export function stationWindow(startMs: number, station: number, cfg: TimingConfig = DEFAULT_TIMING): StationWindow {
  const start = startMs + (station - 1) * cfg.startIntervalMs;
  return { startMs: start, endMs: start + cfg.workMs, scoringEndMs: start + cfg.workMs + cfg.transitionMs };
}

/** Race time at which the athlete who started at `startMs` completes Station 09. */
export function finishMs(startMs: number, cfg: TimingConfig = DEFAULT_TIMING): number {
  return stationWindow(startMs, cfg.stationCount, cfg).endMs;
}

export type StationPhase = "SCHEDULED" | "WORK" | "SCORING" | "LOCKED";

/**
 * What a station window is doing at race time `raceMs`. Boundaries are exact and there is no grace period:
 * at `endMs` the work is over and performance input is locked; only technique/OCR flags survive the 0:30 that follow.
 */
export function stationPhase(window: StationWindow, raceMs: number): StationPhase {
  if (raceMs < window.startMs) return "SCHEDULED";
  if (raceMs < window.endMs) return "WORK";
  if (raceMs < window.scoringEndMs) return "SCORING";
  return "LOCKED";
}

/** "3:05" style; negative values clamp to 0:00. Whole seconds, rounded DOWN (a countdown never shows 0:00 early). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Race clock "H:MM:SS" (or "M:SS" under an hour). Rounded down: the clock never runs ahead of the server. */
export function formatRaceClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
