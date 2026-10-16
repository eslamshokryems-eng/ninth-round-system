/**
 * THE NINTH League — domain types.
 *
 * The league is a SEPARATE module from the race engine: a weekly "league challenge" is not a THE NINTH race. Nothing here imports from
 * @9thround/race, and the league never reads or writes race timing, slots or station scores.
 *
 * APPROVED product rules: 8-week seasons, one main challenge per week, cumulative points decide the standings.
 * PROVISIONAL (configurable, never hard-wired): the points table, tie handling, eligibility timing, attempts per challenge, which attempt counts,
 * absence handling, correction window, appeals. Their defaults below are development defaults only.
 */

export const SEASON_WEEKS = 8;

export type SeasonStatus = "draft" | "scheduled" | "active" | "completed";
export const SEASON_STATUSES: readonly SeasonStatus[] = ["draft", "scheduled", "active", "completed"];

/** draft → scheduled → active → completed. A completed season never reopens. */
export const SEASON_TRANSITIONS: Readonly<Record<SeasonStatus, readonly SeasonStatus[]>> = {
  draft: ["scheduled"],
  scheduled: ["active", "draft"],
  active: ["completed"],
  completed: [],
};

export type ChallengeStatus = "draft" | "published" | "open" | "closed";
export const CHALLENGE_STATUSES: readonly ChallengeStatus[] = ["draft", "published", "open", "closed"];
/** draft → published (visible, not yet scoreable) → open (attempts accepted) → closed (points awarded). Closed never reopens. */
export const CHALLENGE_TRANSITIONS: Readonly<Record<ChallengeStatus, readonly ChallengeStatus[]>> = {
  draft: ["published"],
  published: ["open", "draft"],
  open: ["closed", "published"],
  closed: [],
};

export type MetricKind = "TIME" | "REPS" | "DISTANCE" | "LOAD" | "NUMERIC";
export const METRIC_KINDS: readonly MetricKind[] = ["TIME", "REPS", "DISTANCE", "LOAD", "NUMERIC"];
export type RankDirection = "LOWER_WINS" | "HIGHER_WINS";

/** Units are an explicit, closed list per metric kind: a result's unit can never be free text. */
export const METRIC_UNITS: Readonly<Record<MetricKind, readonly string[]>> = {
  TIME: ["s", "ms"],
  REPS: ["reps"],
  DISTANCE: ["m", "km"],
  LOAD: ["kg"],
  NUMERIC: ["count", "points", "kcal", "watts", "%"],
};

export interface Metric {
  readonly kind: MetricKind;
  readonly unit: string;
  readonly direction: RankDirection;
}

/** Which approved attempt counts when a member has several. PROVISIONAL (default BEST). */
export type CountingPolicy = "BEST" | "LATEST" | "FIRST_APPROVED";
export interface AttemptPolicy {
  readonly maxAttempts: number;
  readonly counting: CountingPolicy;
}

export interface Challenge {
  readonly id: string;
  readonly seasonId: string;
  readonly weekNumber: number;
  readonly name: string;
  readonly description: string;
  readonly instructions: string;
  readonly safetyNotes: string;
  readonly metric: Metric;
  readonly attemptPolicy: AttemptPolicy;
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly referenceUrl: string | null;
  /** true: a second person must approve every attempt before it counts; false: an attempt recorded by authorized staff counts at once. */
  readonly requiresVerification: boolean;
  readonly status: ChallengeStatus;
}

export type TiePolicy = "SHARE" | "SPLIT";
export type AbsencePolicy = "ZERO" | "PARTICIPATION";
export type EligibilityPolicy = "AT_REGISTRATION" | "ENTIRE_SEASON";

/** Points for rank 1..n (index 0 = rank 1), `beyond` for any rank past the table, `participation` is the floor for an approved result, `absent` for an eligible non-participant. */
export interface PointsSchedule {
  readonly byRank: readonly number[];
  readonly beyond: number;
  readonly participation: number;
  readonly absent: number;
}

/** DEVELOPMENT DEFAULT ONLY — the real table is a business decision that has not been taken. Always read the season's own schedule. */
export const PROVISIONAL_POINTS_SCHEDULE: PointsSchedule = {
  byRank: [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  beyond: 1,
  participation: 1,
  absent: 0,
};

export interface SeasonRules {
  readonly points: PointsSchedule;
  /** PROVISIONAL: SHARE = tied results all receive the points of the best shared rank; SPLIT = they share the average of the tied places. */
  readonly tiePolicy: TiePolicy;
  readonly absencePolicy: AbsencePolicy;
  readonly eligibility: EligibilityPolicy;
}

export const PROVISIONAL_SEASON_RULES: SeasonRules = {
  points: PROVISIONAL_POINTS_SCHEDULE,
  tiePolicy: "SHARE",
  absencePolicy: "ZERO",
  eligibility: "AT_REGISTRATION",
};

export interface Season {
  readonly id: string;
  readonly publicSlug: string;
  readonly name: string;
  readonly status: SeasonStatus;
  readonly startsOn: string; // YYYY-MM-DD
  readonly endsOn: string;
  readonly rules: SeasonRules;
  /** Public visibility is separate from lifecycle: an unpublished season is never returned by any public read. */
  readonly published: boolean;
}

export interface Participant {
  readonly id: string;
  readonly seasonId: string;
  /** Opaque, random, URL-safe: the ONLY participant identifier a public page may carry. */
  readonly publicId: string;
  /** Public-safe name, e.g. "Ahmed K." */
  readonly displayName: string;
  /** Link to the gym system's member — private, never public, never a foreign key. */
  readonly externalRef: string | null;
  readonly active: boolean;
  readonly eligible: boolean;
}

export type AttemptStatus = "pending" | "approved" | "rejected" | "void";
export interface Attempt {
  readonly id: string;
  readonly seasonId: string;
  readonly challengeId: string;
  readonly participantId: string;
  readonly value: number;
  readonly unit: string;
  readonly attemptNo: number;
  readonly attemptedAt: string;
  readonly recordedBy: string;
  readonly reviewedBy: string | null;
  readonly status: AttemptStatus;
  readonly reason: string | null;
  readonly correctedFrom: string | null;
  readonly clientRequestId: string;
}

/** One append-only accounting line. A participant's points for a challenge = the SUM of their lines for it. */
export interface LedgerEntry {
  readonly seasonId: string;
  readonly challengeId: string;
  readonly participantId: string;
  /** Hundredths of a point (integer) — no floating point in the accounting. */
  readonly pointsCents: number;
  readonly rank: number | null;
  readonly reason: "AWARD" | "ABSENT" | "ADJUSTMENT";
}

export type LeagueRole = "LEAGUE_ADMIN" | "JUDGE" | "REVIEWER";
export interface Actor {
  readonly id: string;
  readonly isSuperAdmin: boolean;
  readonly roles: readonly LeagueRole[];
}
