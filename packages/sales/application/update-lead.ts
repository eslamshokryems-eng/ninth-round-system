import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { UpdateLeadInput } from "../domain/lead";
import type { LeadRepository } from "../domain/lead-repository";

export class UpdateLeadUseCase implements UseCase<UpdateLeadInput, void> {
  constructor(private readonly leads: LeadRepository) {}

  async execute(input: UpdateLeadInput): Promise<Result<void>> {
    if (!input.fullName.trim()) {
      return err(domainError("FULL_NAME_REQUIRED", "Full name is required."));
    }
    if (!input.phone.trim()) {
      return err(domainError("PHONE_REQUIRED", "Phone number is required."));
    }

    return this.leads.update(input);
  }
}
