import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeadRepository } from "../domain/lead-repository";

export interface AssignLeadInput {
  leadId: string;
  assignedToId: string;
  /** Required: every assignment / reassignment is recorded with who, when and why. */
  reason: string;
}

/** Assign or reassign one lead (manager / Super Admin). Leads are never put back into the pool by unassigning. */
export class AssignLeadUseCase implements UseCase<AssignLeadInput, void> {
  constructor(private readonly leads: LeadRepository) {}

  async execute(input: AssignLeadInput): Promise<Result<void>> {
    if (!input.assignedToId) {
      return err(domainError("ASSIGNEE_REQUIRED", "Choose the employee who will own this lead."));
    }
    if (!input.reason.trim()) {
      return err(domainError("ASSIGN_REASON_REQUIRED", "A reason is required to assign or reassign a lead."));
    }
    return this.leads.assign(input.leadId, input.assignedToId, input.reason.trim());
  }
}
