import type { PublicLeague, PublicStandingRow } from "./public";
import type { Attempt, Challenge, ChallengeStatus, LeagueRole, Season, SeasonRules, SeasonStatus } from "./types";
import type { ImportResult } from "./import";

/** What the league staff screens read. Mirrors race_league_admin_overview(). */
export interface AdminOverview {
  readonly season: Season;
  readonly isAdmin: boolean;
  readonly challenges: readonly Challenge[];
  readonly participants: readonly { id: string; publicId: string; displayName: string; active: boolean; eligible: boolean; externalRef: string | null }[];
  readonly attempts: readonly AdminAttempt[];
  readonly standings: readonly AdminStanding[];
  readonly staff: readonly { profileId: string; role: LeagueRole; active: boolean }[] | null;
}
export type AdminAttempt = Pick<Attempt, "id" | "challengeId" | "participantId" | "value" | "unit" | "attemptNo" | "attemptedAt" | "status" | "reason" | "recordedBy" | "reviewedBy" | "correctedFrom">;
export interface AdminStanding {
  readonly id: string;
  readonly publicId: string;
  readonly displayName: string;
  readonly rank: number;
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
  addParticipant(seasonId: string, displayName: string, externalRef: string | null, eligible: boolean): Promise<string>;
  importParticipants(seasonId: string, csv: string): Promise<{ preview: ImportResult; added: number; issues: readonly { row: number; message: string }[] }>;
  setParticipant(participantId: string, patch: { displayName?: string; active?: boolean; eligible?: boolean }, reason: string): Promise<void>;
  recordAttempt(input: { challengeId: string; participantId: string; value: number; attemptedAt?: string; clientRequestId: string }): Promise<AdminAttempt & { replay: boolean }>;
  reviewAttempt(attemptId: string, decision: "approve" | "reject", reason?: string): Promise<AdminAttempt>;
  correctAttempt(attemptId: string, newValue: number | null, reason: string): Promise<{ ledgerLines: number }>;
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
