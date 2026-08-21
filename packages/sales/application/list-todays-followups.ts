import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeadFollowup } from "../domain/lead-followup";
import type { LeadFollowupRepository } from "../domain/lead-followup-repository";

export type ListTodaysFollowupsInput = Record<string, never>;

export class ListTodaysFollowupsUseCase implements UseCase<ListTodaysFollowupsInput, LeadFollowup[]> {
  constructor(private readonly followups: LeadFollowupRepository) {}

  async execute(): Promise<Result<LeadFollowup[]>> {
    return this.followups.listDueToday();
  }
}
