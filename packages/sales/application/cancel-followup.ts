import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeadFollowupRepository } from "../domain/lead-followup-repository";

export class CancelFollowupUseCase implements UseCase<string, void> {
  constructor(private readonly followups: LeadFollowupRepository) {}

  async execute(followupId: string): Promise<Result<void>> {
    return this.followups.cancel(followupId);
  }
}
