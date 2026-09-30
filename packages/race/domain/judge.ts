/** Judge scoring — what a judge's device sees and sends. Times are RACE milliseconds. */

export type ActionType = "REP" | "NO_REP" | "LAP" | "PENALTY" | "HOLD_START" | "HOLD_BREAK" | "HOLD_RESUME" | "TECHNIQUE_SCORE" | "VOID";
export type ActionStatus = "ACCEPTED" | "REJECTED" | "PENDING_MASTER_REVIEW";

export interface StationView {
  serverTime: string;
  station: { number: number; name: string; hasTechnique: boolean };
  clock: { started: boolean; paused: boolean; finished: boolean; raceMs: number | null; version: number };
  current: {
    resultId: string;
    raceNumber: string;
    fullName: string;
    categoryCode: string;
    movement: string | null;
    state: "WORK" | "TRANSITION";
    windowStartMs: number;
    windowEndMs: number;
    scoringEndMs: number;
    remainingMs: number;
    tally: ScoreTally;
  } | null;
  next: { raceNumber: string; fullName: string; startsInMs: number } | null;
}

/** Derived by the server from the ledger — the device never computes an official score. */
export interface ScoreTally {
  reps?: number;
  noReps?: number;
  laps?: number;
  penalty?: number;
  holdMs?: number;
  technique?: number | null;
  pendingReview?: number;
  rejected?: number;
  scoringType?: string;
  score?: number | null;
}

export interface RecordActionInput {
  resultId: string;
  type: ActionType;
  /** Generated ONCE on the device when the judge taps; every retry re-sends the same id. */
  clientEventId: string;
  value?: number;
  origin: "ONLINE" | "OFFLINE_QUEUE";
  deviceRecordedAt?: string;
  deviceRaceMs?: number;
  deviceSeq?: number;
  voidsEventId?: string;
}

export interface RecordActionResult {
  performanceEventId: string;
  status: ActionStatus;
  rejectionCode: string | null;
  serverRaceMs: number;
  /** True when this id had already been recorded: the original row was returned, nothing new was written. */
  duplicate: boolean;
  tally: ScoreTally;
}

export type ReviewDecision = "APPROVED" | "REJECTED";
