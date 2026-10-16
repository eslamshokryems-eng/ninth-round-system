import type { PublicLeague, PublicStandingRow } from "./public";
import type { Appeal, Attempt, Challenge, ChallengeStatus, CorrectionRecord, CorrectionRequest, EligibilityDecision, EligibilityDecisionCategory, LeagueRole, Season, SeasonRules, SeasonStatus } from "./types";
import type { ImportResult } from "./import";

/** What the league staff screens read. Mirrors race_league_admin_overview(). */
export interface AdminOverview {
  readonly season: Season;
  readonly isAdmin: boolean;
  readonly challenges: readonly Challenge[];
  readonly participants: readonly { id: string; publicId: string; displayName: string; active: boolean; eligible: boolean; externalRef: string | null; membershipVerifiedOn: string }[];
  readonly attempts: readonly AdminAttempt[];
  /** Judges and administrators see requests (so a judge can follow up); only administrators decide them. */
  readonly correctionRequests: readonly CorrectionRequest[];
  /** Applied corrections: previous value, new value, actor, time, reason. Administrators only (empty for others). */
  readonly corrections: readonly CorrectionRecord[];
  /** Participant appeals contain a participant's own words: administrators only (empty for others). */
  readonly appeals: readonly Appeal[];
  readonly eligibilityDecisions: readonly EligibilityDecision[];
  readonly standings: readonly AdminStanding[];
  readonly staff: readonly { profileId: string; role: LeagueRole; active: boolean }[] | null;
}
export type AdminAttempt = Pick<Attempt, "id" | "challengeId" | "participantId" | "value" | "unit" | "attemptNo" | "attemptedAt" | "status" | "reason" | "recordedBy" | "reviewedBy" | "correctedFrom">;
export interface AdminStanding {
  readonly id: string;
  readonly publicId: string;
  readonly displayName: string;
  readonly rank: number;
  readonly tied: boolean;
  readonly totalPoints: number;
  readonly weeklyPoints: Readonly<Record<number, number>>;
  readonly challengesCompleted: number;
  readonly firstPlaces: number;
  readonly movement: number | null;
  readonly gapToNext: number | null;
}
export interface MySeason {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: SeasonStatus;
  readonly published: boolean;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly roles: readonly LeagueRole[];
  readonly isSuperAdmin: boolean;
}
export interface ChallengeInput {
  readonly name?: string;
  readonly description?: string;
  readonly instructions?: string;
  readonly safetyNotes?: string;
  readonly metricKind?: string;
  readonly unit?: string;
  readonly direction?: string;
  readonly maxAttempts?: number;
  readonly counting?: string;
  readonly opensAt?: string | null;
  readonly closesAt?: string | null;
  readonly referenceUrl?: string | null;
  readonly requiresVerification?: boolean;
}
export interface AuditLine {
  readonly at: string;
  readonly actor: string | null;
  readonly action: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

/**
 * The ONE seam between the screens and the data. `SupabaseLeague` (database RPCs — authorization enforced by the database) is the real
 * implementation; `InMemoryLeague` mirrors the same rules for local development and tests. Screens never know which one they hold.
 */
export interface LeagueGateway {
  // public, read-only
  publicLeague(slug: string): Promise<PublicLeague | null>;
  publicChallengeResults(slug: string, week: number): Promise<PublicChallengeResults | null>;
  publicParticipant(slug: string, publicId: string): Promise<PublicParticipantPage | null>;
  // staff
  mySeasons(): Promise<readonly MySeason[]>;
  overview(seasonId: string): Promise<AdminOverview>;
  createSeason(input: { slug: string; name: string; startsOn: string; endsOn: string; rules?: SeasonRules }): Promise<string>;
  setSeasonStatus(seasonId: string, status: SeasonStatus, reason?: string): Promise<void>;
  setPublished(seasonId: string, published: boolean, reason: string): Promise<void>;
  updateRules(seasonId: string, rules: SeasonRules, reason: string): Promise<number>;
  upsertChallenge(seasonId: string, week: number, input: ChallengeInput): Promise<string>;
  setChallengeStatus(challengeId: string, status: ChallengeStatus): Promise<{ ledgerLines: number }>;
  /** Registration requires staff to confirm an ACTIVE, verified gym membership (`membershipVerified` must be true; false is refused). Nothing reads the gym database. */
  addParticipant(seasonId: string, displayName: string, externalRef: string | null, membershipVerified: boolean): Promise<string>;
  importParticipants(seasonId: string, csv: string): Promise<{ preview: ImportResult; added: number; issues: readonly { row: number; message: string }[] }>;
  setParticipant(participantId: string, patch: { displayName?: string; active?: boolean }, reason: string): Promise<void>;
  /** Restrict or reinstate a participant. A restriction needs a documented DISCIPLINARY or FRAUD decision; REINSTATEMENT reverses one. Membership expiry is never a reason. */
  setEligibility(participantId: string, eligible: boolean, category: EligibilityDecisionCategory, reason: string): Promise<{ ledgerLines: number }>;
  recordAttempt(input: { challengeId: string; participantId: string; value: number; attemptedAt?: string; clientRequestId: string }): Promise<AdminAttempt & { replay: boolean }>;
  reviewAttempt(attemptId: string, decision: "approve" | "reject", reason?: string): Promise<AdminAttempt>;
  correctAttempt(attemptId: string, newValue: number | null, reason: string): Promise<{ ledgerLines: number }>;
  /** Judge/administrator: ask for a result to change. Changes nothing by itself. `proposedValue` null = remove the result. */
  requestCorrection(attemptId: string, proposedValue: number | null, reason: string): Promise<string>;
  /** Administrator only: apply (a normal audited correction) or decline a request. */
  decideCorrectionRequest(requestId: string, decision: "apply" | "decline", reason: string): Promise<{ ledgerLines: number }>;
  /** Staff intake of a participant's appeal against a published result, inside the season's appeal window. Never changes a score. */
  lodgeAppeal(input: { challengeId: string; participantId: string; reason: string }): Promise<string>;
  /** Administrator who did not record the result: record UPHELD or DISMISSED with a reason. Never changes a score. */
  decideAppeal(appealId: string, decision: "upheld" | "dismissed", reason: string): Promise<void>;
  recompute(challengeId: string): Promise<number>;
  audit(seasonId: string, limit?: number): Promise<readonly AuditLine[]>;
}

export interface PublicChallengeResults {
  readonly weekNumber: number;
  readonly name: string;
  readonly unit: string;
  readonly direction: string;
  readonly results: readonly { rank: number; publicId: string; displayName: string; value: number; points: number }[];
}
export interface PublicParticipantPage {
  readonly standing: PublicStandingRow | null;
  readonly results: readonly { weekNumber: number; challenge: string; unit: string; value: number | null; rank: number | null; points: number }[];
}
