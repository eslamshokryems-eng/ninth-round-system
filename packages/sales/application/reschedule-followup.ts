import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeadFollowupRepository } from "../domain/lead-followup-repository";

export interface RescheduleFollowupInput {
  followupId: string;
  dueAt: string;
}

export class RescheduleFollowupUseCase implements UseCase<RescheduleFollowupInput, void> {
  constructor(private readonly followups: LeadFollowupRepository) {}

  async execute(input: RescheduleFollowupInput): Promise<Result<void>> {
    if (!input.dueAt) {
      return err(domainError("DUE_AT_REQUIRED", "A new follow-up date/time is required."));
    }
    return this.followups.reschedule(input.followupId, input.dueAt);
  }
}
