import type { Result, UseCase } from "@9thround/shared-kernel";
import { validateCoachDesignationReason } from "../domain/challenge-coach-assignment";
import type { ChallengeParticipantRepository } from "../domain/challenge-participant-repository";

export interface DesignateChallengeCoachInput {
  participantId: string;
  coachId: string;
  /** Required (Phase 2 security remediation M-2) — no override may be silent, even when the automatic rule was already unambiguous. */
  reason: string;
}

/** Branch Manager/Super Admin only — the ambiguity-override escape hatch from spec §6.6; the real gate is designate_challenge_coach()'s own role check. */
export class DesignateChallengeCoachUseCase implements UseCase<DesignateChallengeCoachInput, void> {
  constructor(private readonly participants: ChallengeParticipantRepository) {}

  async execute(input: DesignateChallengeCoachInput): Promise<Result<void>> {
    const reasonResult = validateCoachDesignationReason(input.reason);
    if (reasonResult.isErr) return reasonResult;

    return this.participants.designateCoach(input.participantId, input.coachId, input.reason);
  }
}
