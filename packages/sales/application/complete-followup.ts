import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeadFollowupRepository } from "../domain/lead-followup-repository";

export interface CompleteFollowupInput {
  followupId: string;
  note: string | null;
}

export class CompleteFollowupUseCase implements UseCase<CompleteFollowupInput, void> {
  constructor(private readonly followups: LeadFollowupRepository) {}

  async execute(input: CompleteFollowupInput): Promise<Result<void>> {
    return this.followups.complete(input.followupId, input.note);
  }
}
