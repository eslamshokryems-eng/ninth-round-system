import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { CreateLeadInput } from "../domain/lead";
import type { LeadRepository } from "../domain/lead-repository";

/** The "+ New Lead" form's single use case. Mirrors RegisterMembershipUseCase's validation shape. */
export class CreateLeadUseCase implements UseCase<CreateLeadInput, { leadId: string }> {
  constructor(private readonly leads: LeadRepository) {}

  async execute(input: CreateLeadInput): Promise<Result<{ leadId: string }>> {
    if (!input.fullName.trim()) {
      return err(domainError("FULL_NAME_REQUIRED", "Full name is required."));
    }
    if (!input.phone.trim()) {
      return err(domainError("PHONE_REQUIRED", "Phone number is required."));
    }

    return this.leads.create(input);
  }
}
