import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeadRepository } from "../domain/lead-repository";

/** Brings a lost lead back to active follow-up. */
export class RestoreLeadUseCase implements UseCase<string, void> {
  constructor(private readonly leads: LeadRepository) {}

  async execute(leadId: string): Promise<Result<void>> {
    return this.leads.restore(leadId);
  }
}
