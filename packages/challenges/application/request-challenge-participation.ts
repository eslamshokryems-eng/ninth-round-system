import type { Result, UseCase } from "@9thround/shared-kernel";
import type { ChallengeParticipant } from "../domain/challenge-participant";
import type { ChallengeParticipantRepository } from "../domain/challenge-participant-repository";

export interface RequestChallengeParticipationInput {
  challengeId: string;
  /** The participant's own choice — null for a GLOBAL competition; a branch for BRANCH/MULTI_BRANCH, validated server-side against the challenge's own scope/branch list. Never derived from membership or any staff-assigned branch. */
  branchId: string | null;
}

/**
 * Auto-approve/auto-reject only — there is no pending state for the
 * caller to wait on; eligibility (age-only) is evaluated entirely inside
 * the request_challenge_participation() RPC and the decision comes back
 * in this same call. Identity is the caller's own profiles.id, resolved
 * server-side from auth.uid() — never a membership lookup.
 */
export class RequestChallengeParticipationUseCase implements UseCase<RequestChallengeParticipationInput, ChallengeParticipant> {
  constructor(private readonly participants: ChallengeParticipantRepository) {}

  async execute(input: RequestChallengeParticipationInput): Promise<Result<ChallengeParticipant>> {
    return this.participants.requestParticipation(input.challengeId, input.branchId);
  }
}
