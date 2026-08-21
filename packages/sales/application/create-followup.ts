import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { CreateFollowupInput } from "../domain/lead-followup";
import type { LeadFollowupRepository } from "../domain/lead-followup-repository";

export class CreateFollowupUseCase implements UseCase<CreateFollowupInput, { followupId: string }> {
  constructor(private readonly followups: LeadFollowupRepository) {}

  async execute(input: CreateFollowupInput): Promise<Result<{ followupId: string }>> {
    if (!input.dueAt) {
      return err(domainError("DUE_AT_REQUIRED", "A follow-up date/time is required."));
    }
    return this.followups.create(input);
  }
}
