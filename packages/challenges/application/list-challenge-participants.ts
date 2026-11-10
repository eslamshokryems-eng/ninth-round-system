import type { Result, UseCase } from "@9thround/shared-kernel";
import type { ChallengeParticipantRow } from "../domain/challenge-queries";
import type { ChallengeParticipantRepository } from "../domain/challenge-participant-repository";

/** The roster on a competition's detail page. In-scope staff get everyone; a customer gets only their own row. */
export class ListChallengeParticipantsUseCase implements UseCase<string, ChallengeParticipantRow[]> {
  constructor(private readonly participants: ChallengeParticipantRepository) {}

  async execute(challengeId: string): Promise<Result<ChallengeParticipantRow[]>> {
    return this.participants.listForChallenge(challengeId);
  }
}

/** "My challenges" for a member — every competition they have requested to join, with the eligibility decision. */
export class ListOwnChallengeParticipationsUseCase implements UseCase<void, ChallengeParticipantRow[]> {
  constructor(private readonly participants: ChallengeParticipantRepository) {}

  async execute(): Promise<Result<ChallengeParticipantRow[]>> {
    return this.participants.listOwn();
  }
}
