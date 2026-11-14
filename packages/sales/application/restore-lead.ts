import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { ReopenLeadInput } from "../domain/lead";
import type { LeadRepository } from "../domain/lead-repository";

/** Reopen a lost lead. The next action is scheduled in the same step, so the lead never becomes active without one. */
export class RestoreLeadUseCase implements UseCase<ReopenLeadInput, void> {
  constructor(private readonly leads: LeadRepository) {}

  async execute(input: ReopenLeadInput): Promise<Result<void>> {
    if (Number.isNaN(input.nextAt.getTime())) {
      return err(domainError("NEXT_ACTION_REQUIRED", "Choose when to contact this lead next."));
    }
    if (input.nextAt.getTime() < Date.now() - 5 * 60_000) {
      return err(domainError("NEXT_ACTION_IN_PAST", "The next action must be in the future."));
    }
    return this.leads.restore(input);
  }
}

/** Conversion details (who was credited, who registered it) for a converted lead; null when the lead is not converted. */
export class GetLeadConversionUseCase implements UseCase<string, import("../domain/lead").LeadConversion | null> {
  constructor(private readonly leads: LeadRepository) {}

  async execute(leadId: string) {
    return this.leads.getConversion(leadId);
  }
}
