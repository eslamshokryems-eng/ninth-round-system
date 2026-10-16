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
  /** When the challenge was closed (points awarded); null before. Together with the season's first publication it fixes when a result became public. */
  readonly closedAt: string | null;
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

/**
 * PROVISIONAL (owner-supplied, not final): 1st 100, 2nd 90, 3rd 80, 4th 75, 5th 70, 6th 65, 7th 60, 8th 55, 9th 50, every other eligible participant with an
 * approved valid result 40, an absent participant 0. Always read the season's own schedule — this is only the default for a new season.
 */
export const PROVISIONAL_POINTS_SCHEDULE: PointsSchedule = {
  byRank: [100, 90, 80, 75, 70, 65, 60, 55, 50],
  beyond: 40,
  participation: 40,
  absent: 0,
};

/** PROVISIONAL: how long after a result is published a participant may appeal. */
export const DEFAULT_APPEAL_WINDOW_HOURS = 48;
/** PROVISIONAL: up to three attempts per weekly challenge, the best valid judge-approved attempt counts. */
export const DEFAULT_ATTEMPT_POLICY: AttemptPolicy = { maxAttempts: 3, counting: "BEST" };

export interface SeasonRules {
  readonly points: PointsSchedule;
  /** PROVISIONAL: SHARE = tied results all receive the points of the best shared rank; SPLIT = they share the average of the tied places. */
  readonly tiePolicy: TiePolicy;
  readonly absencePolicy: AbsencePolicy;
  readonly eligibility: EligibilityPolicy;
  /** Hours after a challenge's result is published during which an appeal may be lodged. */
  readonly appealWindowHours: number;
}

export const PROVISIONAL_SEASON_RULES: SeasonRules = {
  points: PROVISIONAL_POINTS_SCHEDULE,
  tiePolicy: "SHARE",
  absencePolicy: "ZERO",
  eligibility: "AT_REGISTRATION",
  appealWindowHours: DEFAULT_APPEAL_WINDOW_HOURS,
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
  /** First moment the season was made public; null while it never was. Starts the appeal window for results that were already closed. */
  readonly firstPublishedAt: string | null;
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
  /** The day the participant was added (YYYY-MM-DD) — used by the ENTIRE_SEASON eligibility rule (no late joiners). */
  readonly joinedOn: string;
  /** The day staff verified an ACTIVE gym membership for this registration. Required to register; later expiry never changes eligibility. */
  readonly membershipVerifiedOn: string;
}

/** Why an administrator changed a participant's eligibility. A restriction needs a documented DISCIPLINARY or FRAUD decision; REINSTATEMENT reverses one. */
export type EligibilityDecisionCategory = "DISCIPLINARY" | "FRAUD" | "REINSTATEMENT";
export const ELIGIBILITY_DECISION_CATEGORIES: readonly EligibilityDecisionCategory[] = ["DISCIPLINARY", "FRAUD", "REINSTATEMENT"];
export interface EligibilityDecision {
  readonly id: string;
  readonly seasonId: string;
  readonly participantId: string;
  readonly category: EligibilityDecisionCategory;
  readonly previousEligible: boolean;
  readonly newEligible: boolean;
  readonly reason: string;
  readonly decidedBy: string;
  readonly decidedAt: string;
}

/** A judge's request to change a result. It never changes anything by itself. */
export type CorrectionRequestStatus = "pending" | "applied" | "declined";
export interface CorrectionRequest {
  readonly id: string;
  readonly seasonId: string;
  readonly challengeId: string;
  readonly attemptId: string;
  readonly participantId: string;
  /** null = remove the result. */
  readonly proposedValue: number | null;
  readonly reason: string;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly status: CorrectionRequestStatus;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly decisionReason: string | null;
}
/** The permanent record of an applied correction: what it was, what it became, who, when, why. */
export interface CorrectionRecord {
  readonly id: string;
  readonly seasonId: string;
  readonly challengeId: string;
  readonly participantId: string;
  readonly attemptId: string;
  readonly replacementAttemptId: string | null;
  readonly previousValue: number;
  /** null = the result was removed. */
  readonly newValue: number | null;
  readonly reason: string;
  readonly actor: string;
  readonly at: string;
  readonly requestId: string | null;
}

/** UPHELD = the reviewing admin agrees the result should be revisited — it still changes NOTHING until an admin applies a normal, audited correction. */
export type AppealStatus = "submitted" | "upheld" | "dismissed";
export interface Appeal {
  readonly id: string;
  readonly seasonId: string;
  readonly challengeId: string;
  readonly participantId: string;
  readonly reason: string;
  readonly lodgedBy: string;
  readonly lodgedAt: string;
  readonly status: AppealStatus;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly decisionReason: string | null;
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
