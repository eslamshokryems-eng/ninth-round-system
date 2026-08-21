import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeadLostReason } from "../domain/lead";
import type { LeadRepository } from "../domain/lead-repository";

export interface MarkLeadLostInput {
  leadId: string;
  reason: LeadLostReason;
  note: string | null;
}

export class MarkLeadLostUseCase implements UseCase<MarkLeadLostInput, void> {
  constructor(private readonly leads: LeadRepository) {}

  async execute(input: MarkLeadLostInput): Promise<Result<void>> {
    if (!input.reason) {
      return err(domainError("LOST_REASON_REQUIRED", "A reason is required to mark a lead as lost."));
    }
    return this.leads.markLost(input.leadId, input.reason, input.note);
  }
}
