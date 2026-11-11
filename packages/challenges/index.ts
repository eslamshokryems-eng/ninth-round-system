import type { TypedSupabaseClient } from "@9thround/supabase-client";
import { CreateChallengeSeasonUseCase } from "./application/create-challenge-season";
import { CreateChallengeUseCase } from "./application/create-challenge";
import { SetChallengeStatusUseCase } from "./application/set-challenge-status";
import { AddChallengeEligibilityRuleUseCase, RemoveChallengeEligibilityRuleUseCase } from "./application/manage-challenge-eligibility-rules";
import { SetChallengeWeightRangeUseCase } from "./application/set-challenge-weight-range";
import { RequestChallengeParticipationUseCase } from "./application/request-challenge-participation";
import { DesignateChallengeCoachUseCase } from "./application/designate-challenge-coach";
import { SubmitChallengeResultUseCase } from "./application/submit-challenge-result";
import { ApproveChallengeResultUseCase, RejectChallengeResultUseCase } from "./application/review-challenge-result";
import { RequestChallengeResultCorrectionUseCase } from "./application/request-challenge-result-correction";
import {
  ApproveChallengeResultCorrectionUseCase,
  RejectChallengeResultCorrectionUseCase,
} from "./application/review-challenge-result-correction";
import { GetOwnChallengeDisplayNameUseCase, SetChallengeDisplayNameUseCase } from "./application/set-challenge-display-name";
import { GetChallengeDetailUseCase, ListChallengeBranchesUseCase, ListChallengesUseCase } from "./application/list-challenges";
import { GetChallengeWeightRangeUseCase, ListChallengeSeasonsUseCase } from "./application/list-challenge-seasons";
import { ListChallengeParticipantsUseCase, ListOwnChallengeParticipationsUseCase } from "./application/list-challenge-participants";
import { ListChallengeResultReviewsUseCase, ListChallengeResultsUseCase, ListOwnChallengeResultsUseCase } from "./application/list-challenge-results";
import {
  GetChallengeLeaderboardUseCase,
  GetSeasonLeaderboardByBranchUseCase,
  GetSeasonLeaderboardUseCase,
} from "./application/get-challenge-leaderboard";
import { SupabaseChallengeSeasonRepository } from "./infrastructure/supabase-challenge-season-repository";
import { SupabaseChallengeSettingsRepository } from "./infrastructure/supabase-challenge-settings-repository";
import { SupabaseChallengeRepository } from "./infrastructure/supabase-challenge-repository";
import { SupabaseChallengeParticipantRepository } from "./infrastructure/supabase-challenge-participant-repository";
import { SupabaseChallengeResultRepository } from "./infrastructure/supabase-challenge-result-repository";
import { SupabaseChallengeDisplayNameRepository } from "./infrastructure/supabase-challenge-display-name-repository";
import { SupabaseChallengeLeaderboardRepository } from "./infrastructure/supabase-challenge-leaderboard-repository";

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

export type { ChallengeDisplayName } from "./domain/challenge-display-name";
export { MAX_DISPLAY_NAME_LENGTH, MIN_DISPLAY_NAME_LENGTH, validateDisplayName } from "./domain/challenge-display-name";

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
export { aggregatePointsByParticipant, sumLedgerPoints } from "./domain/challenge-points-ledger";

export { validateCoachDesignationReason, validateIsDesignatedCoach } from "./domain/challenge-coach-assignment";

export type { ChallengeSeasonRepository } from "./domain/challenge-season-repository";
export type { ChallengeSettingsRepository } from "./domain/challenge-settings-repository";
export type { ChallengeRepository, CreateChallengeEligibilityRuleInput, CreateChallengeInput } from "./domain/challenge-repository";
export type { ChallengeParticipantRepository } from "./domain/challenge-participant-repository";
export type {
  ChallengeResultRepository,
  RequestChallengeResultCorrectionInput,
  ReviewChallengeResultInput,
  SubmitChallengeResultInput,
} from "./domain/challenge-result-repository";
export type { ChallengeDisplayNameRepository } from "./domain/challenge-display-name-repository";
export type { ChallengeLeaderboardRepository } from "./domain/challenge-leaderboard-repository";
export type {
  ChallengeBranchOption,
  ChallengeDetail,
  ChallengeEligibilityRuleRow,
  ChallengeLeaderboardEntry,
  ChallengeListItem,
  ChallengeParticipantRow,
  ChallengeResultRow,
  ChallengeResultReviewRow,
  SeasonLeaderboardEntry,
} from "./domain/challenge-queries";

export { CreateChallengeSeasonUseCase } from "./application/create-challenge-season";
export { CreateChallengeUseCase, type CreateChallengeUseCaseInput } from "./application/create-challenge";
export { SetChallengeStatusUseCase, type SetChallengeStatusUseCaseInput } from "./application/set-challenge-status";
export {
  AddChallengeEligibilityRuleUseCase,
  RemoveChallengeEligibilityRuleUseCase,
  type AddChallengeEligibilityRuleUseCaseInput,
} from "./application/manage-challenge-eligibility-rules";
export { SetChallengeWeightRangeUseCase, type SetChallengeWeightRangeInput } from "./application/set-challenge-weight-range";
export { RequestChallengeParticipationUseCase, type RequestChallengeParticipationInput } from "./application/request-challenge-participation";
export { DesignateChallengeCoachUseCase, type DesignateChallengeCoachInput } from "./application/designate-challenge-coach";
export { SubmitChallengeResultUseCase, type SubmitChallengeResultUseCaseInput } from "./application/submit-challenge-result";
export { ApproveChallengeResultUseCase, RejectChallengeResultUseCase, type ReviewChallengeResultUseCaseInput } from "./application/review-challenge-result";
export {
  RequestChallengeResultCorrectionUseCase,
  type RequestChallengeResultCorrectionUseCaseInput,
} from "./application/request-challenge-result-correction";
export {
  ApproveChallengeResultCorrectionUseCase,
  RejectChallengeResultCorrectionUseCase,
  type ReviewChallengeResultCorrectionUseCaseInput,
} from "./application/review-challenge-result-correction";
export {
  GetOwnChallengeDisplayNameUseCase,
  SetChallengeDisplayNameUseCase,
  type SetChallengeDisplayNameInput,
} from "./application/set-challenge-display-name";

export { SupabaseChallengeSeasonRepository } from "./infrastructure/supabase-challenge-season-repository";
export { SupabaseChallengeSettingsRepository } from "./infrastructure/supabase-challenge-settings-repository";
export { SupabaseChallengeRepository } from "./infrastructure/supabase-challenge-repository";
export { SupabaseChallengeParticipantRepository } from "./infrastructure/supabase-challenge-participant-repository";
export { SupabaseChallengeResultRepository } from "./infrastructure/supabase-challenge-result-repository";
export { SupabaseChallengeDisplayNameRepository } from "./infrastructure/supabase-challenge-display-name-repository";
export { SupabaseChallengeLeaderboardRepository } from "./infrastructure/supabase-challenge-leaderboard-repository";
export { GetChallengeDetailUseCase, ListChallengeBranchesUseCase, ListChallengesUseCase } from "./application/list-challenges";
export { GetChallengeWeightRangeUseCase, ListChallengeSeasonsUseCase } from "./application/list-challenge-seasons";
export { ListChallengeParticipantsUseCase, ListOwnChallengeParticipationsUseCase } from "./application/list-challenge-participants";
export { ListChallengeResultReviewsUseCase, ListChallengeResultsUseCase, ListOwnChallengeResultsUseCase } from "./application/list-challenge-results";
export {
  GetChallengeLeaderboardUseCase,
  GetSeasonLeaderboardByBranchUseCase,
  GetSeasonLeaderboardUseCase,
} from "./application/get-challenge-leaderboard";

/**
 * The Challenges context's composition root — same one-entry-point shape
 * as every other context (createSalesModule, createReceptionModule).
 * review/correction use cases are exposed per-decision (approve/reject)
 * rather than taking a decision parameter, mirroring how this factory's
 * siblings expose one use case per distinct action.
 */
export function createChallengesModule(client: TypedSupabaseClient) {
  const seasonRepository = new SupabaseChallengeSeasonRepository(client);
  const settingsRepository = new SupabaseChallengeSettingsRepository(client);
  const challengeRepository = new SupabaseChallengeRepository(client);
  const participantRepository = new SupabaseChallengeParticipantRepository(client);
  const resultRepository = new SupabaseChallengeResultRepository(client);
  const displayNameRepository = new SupabaseChallengeDisplayNameRepository(client);
  const leaderboardRepository = new SupabaseChallengeLeaderboardRepository(client);

  return {
    createChallengeSeason: new CreateChallengeSeasonUseCase(seasonRepository),
    setChallengeWeightRange: new SetChallengeWeightRangeUseCase(settingsRepository),
    createChallenge: new CreateChallengeUseCase(challengeRepository),
    setChallengeStatus: new SetChallengeStatusUseCase(challengeRepository),
    addChallengeEligibilityRule: new AddChallengeEligibilityRuleUseCase(challengeRepository),
    removeChallengeEligibilityRule: new RemoveChallengeEligibilityRuleUseCase(challengeRepository),
    requestChallengeParticipation: new RequestChallengeParticipationUseCase(participantRepository),
    designateChallengeCoach: new DesignateChallengeCoachUseCase(participantRepository),
    submitChallengeResult: new SubmitChallengeResultUseCase(resultRepository),
    approveChallengeResult: new ApproveChallengeResultUseCase(resultRepository),
    rejectChallengeResult: new RejectChallengeResultUseCase(resultRepository),
    requestChallengeResultCorrection: new RequestChallengeResultCorrectionUseCase(resultRepository),
    approveChallengeResultCorrection: new ApproveChallengeResultCorrectionUseCase(resultRepository),
    rejectChallengeResultCorrection: new RejectChallengeResultCorrectionUseCase(resultRepository),
    setChallengeDisplayName: new SetChallengeDisplayNameUseCase(displayNameRepository),

    // Read side. Every one of these is an ordinary select that the
    // row-level policies filter, which is why staff and customers share
    // the same use cases instead of each getting their own query.
    listChallenges: new ListChallengesUseCase(challengeRepository),
    getChallengeDetail: new GetChallengeDetailUseCase(challengeRepository),
    listChallengeBranches: new ListChallengeBranchesUseCase(challengeRepository),
    listChallengeSeasons: new ListChallengeSeasonsUseCase(seasonRepository),
    getChallengeWeightRange: new GetChallengeWeightRangeUseCase(settingsRepository),
    listChallengeParticipants: new ListChallengeParticipantsUseCase(participantRepository),
    listOwnChallengeParticipations: new ListOwnChallengeParticipationsUseCase(participantRepository),
    listChallengeResults: new ListChallengeResultsUseCase(resultRepository),
    listChallengeResultReviews: new ListChallengeResultReviewsUseCase(resultRepository),
    listOwnChallengeResults: new ListOwnChallengeResultsUseCase(resultRepository),
    getOwnChallengeDisplayName: new GetOwnChallengeDisplayNameUseCase(displayNameRepository),
    getChallengeLeaderboard: new GetChallengeLeaderboardUseCase(leaderboardRepository),
    getSeasonLeaderboard: new GetSeasonLeaderboardUseCase(leaderboardRepository),
    getSeasonLeaderboardByBranch: new GetSeasonLeaderboardByBranchUseCase(leaderboardRepository),
  };
}
