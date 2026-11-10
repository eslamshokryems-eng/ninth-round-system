import type { ChallengeCategory, ChallengeMeasurementType, ChallengeProgramType, ChallengeScope, ChallengeScoringDirection, ChallengeStatus } from "./challenge";
import type { ChallengeEligibilityRuleType } from "./challenge-eligibility-rule";
import type { ChallengeParticipantStatus } from "./challenge-participant";
import type { ChallengeResultStatus } from "./challenge-result";

/**
 * Read models for the Challenges screens.
 *
 * These are deliberately separate from the write-side domain entities: every
 * one of them is shaped by what a *page* needs and by what the row-level
 * policies actually let the signed-in caller see, not by the table layout.
 * Nothing here widens access — each read is an ordinary `select` that RLS
 * filters, so the same call returns a staff-sized list for staff and a
 * one-row list for the customer it belongs to.
 */

/** One row of the challenges list (staff console and the member's browse page). */
export interface ChallengeListItem {
  id: string;
  seasonId: string;
  title: string;
  description: string | null;
  category: ChallengeCategory;
  programType: ChallengeProgramType;
  scope: ChallengeScope;
  branchId: string | null;
  status: ChallengeStatus;
  measurementType: ChallengeMeasurementType;
  measurementUnit: string;
  scoringDirection: ChallengeScoringDirection;
  weight: number;
  registrationStartAt: string;
  registrationEndAt: string;
  startsAt: string;
  endsAt: string;
  createdBy: string | null;
}

/** A single eligibility rule as stored against a challenge. */
export interface ChallengeEligibilityRuleRow {
  id: string;
  ruleType: ChallengeEligibilityRuleType;
  value: Record<string, unknown>;
}

/** The challenge detail page: the challenge, its rules, and the branches it is open to. */
export interface ChallengeDetail extends ChallengeListItem {
  eligibilityRules: ChallengeEligibilityRuleRow[];
  /** Populated for MULTI_BRANCH; empty for BRANCH and GLOBAL. */
  openBranchIds: string[];
}

/**
 * A participant row as staff see it, with the public display name joined on.
 * `eligibilityReason` is private to the participant and to in-scope staff —
 * the row-level policies are what keep it away from other customers, not this
 * type.
 */
export interface ChallengeParticipantRow {
  id: string;
  challengeId: string;
  participantProfileId: string;
  branchId: string | null;
  status: ChallengeParticipantStatus;
  eligibilityResult: boolean | null;
  eligibilityReason: string | null;
  designatedCoachId: string | null;
  displayName: string | null;
  requestedAt: string;
}

/** A result row for the review desk and for a member's own submission history. */
export interface ChallengeResultRow {
  id: string;
  challengeId: string;
  challengeTitle: string | null;
  participantProfileId: string;
  displayName: string | null;
  enteredByProfileId: string;
  resultValue: number;
  measurementUnit: string;
  performedAt: string;
  status: ChallengeResultStatus;
  correctsResultId: string | null;
  supersededByResultId: string | null;
  createdAt: string;
}

/** One row of a single competition's leaderboard view. */
export interface ChallengeLeaderboardEntry {
  resultId: string;
  challengeId: string;
  participantProfileId: string;
  branchId: string | null;
  displayName: string;
  resultValue: number;
  overallRank: number;
  branchRank: number;
}

/** One row of a season-wide leaderboard view. */
export interface SeasonLeaderboardEntry {
  seasonId: string;
  participantProfileId: string;
  displayName: string;
  totalPoints: number;
  rank: number;
  /** Only present on the by-branch board. */
  branchId?: string | null;
}

/** A branch, for the create-challenge form's scope pickers. */
export interface ChallengeBranchOption {
  id: string;
  name: string;
}

/**
 * One decision on a result: who decided, what, and the note they left. A
 * rejected result's note is the reason the coach needs before submitting a
 * corrected one. Reviews are append-only, so a result's history is every row
 * returned for it, oldest first.
 */
export interface ChallengeResultReviewRow {
  id: string;
  resultId: string;
  reviewerProfileId: string;
  decision: "approved" | "rejected";
  notes: string | null;
  createdAt: string;
}
