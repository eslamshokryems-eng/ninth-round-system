// Phase 1 scope: domain types and pure validation/scoring logic only.
// Application use cases and Supabase-backed infrastructure land in Phase 2
// (see the 9TH ROUND CHALLENGES implementation plan) — this file will gain
// a createChallengesModule() factory then, mirroring every other domain's
// composition-root wiring (@9thround/reception, @9thround/sales).

export type {
  Challenge,
  ChallengeCategory,
  ChallengeMeasurementType,
  ChallengeProgramType,
  ChallengeScope,
  ChallengeScoringDirection,
  ChallengeStatus,
  RankPointsPolicy,
  RankedEntry,
  ScoredEntry,
} from "./domain/challenge";
export {
  DEFAULT_CHALLENGE_WEIGHT,
  DEFAULT_MAX_CHALLENGE_WEIGHT,
  DEFAULT_MIN_CHALLENGE_WEIGHT,
  DEFAULT_RANK_POINTS_POLICY,
  basePointsForRank,
  calculateEarnedPoints,
  canTransitionChallengeStatus,
  rankResults,
  validateChallengeScope,
  validateChallengeWeight,
} from "./domain/challenge";

export type { ChallengeSeason, ChallengeSeasonStatus, CreateChallengeSeasonInput } from "./domain/challenge-season";
export { validateChallengeSeasonDates } from "./domain/challenge-season";

export type { ChallengeParticipant, ChallengeParticipantStatus } from "./domain/challenge-participant";

export type {
  ChallengeEligibilityContext,
  ChallengeEligibilityDecision,
  ChallengeEligibilityRule,
  ChallengeEligibilityRuleType,
} from "./domain/challenge-eligibility-rule";
export { evaluateChallengeEligibility, validateChallengeEligibilityRule } from "./domain/challenge-eligibility-rule";

export type { ChallengeResult, ChallengeResultStatus } from "./domain/challenge-result";
export { isCurrentChallengeResult } from "./domain/challenge-result";

export type { ChallengeResultReview, ChallengeResultReviewDecision } from "./domain/challenge-result-review";
export { validateReviewDecision, validateReviewerIsNotAuthor } from "./domain/challenge-result-review";

export type { ChallengePointsLedgerEntry } from "./domain/challenge-points-ledger";
export { aggregatePointsByMember, sumLedgerPoints } from "./domain/challenge-points-ledger";
