import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeadRepository } from "../domain/lead-repository";

export interface AssignLeadInput {
  leadId: string;
  assignedToId: string | null;
}

/** Also covers "unassign" (assignedToId: null), putting the lead back in the shared pickup queue. */
export class AssignLeadUseCase implements UseCase<AssignLeadInput, void> {
  constructor(private readonly leads: LeadRepository) {}

  async execute(input: AssignLeadInput): Promise<Result<void>> {
    return this.leads.assign(input.leadId, input.assignedToId);
  }
}
