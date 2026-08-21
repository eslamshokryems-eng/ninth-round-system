import { ok } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeadSummary } from "../domain/lead";
import type { LeadRepository } from "../domain/lead-repository";

export interface CheckDuplicateLeadsInput {
  branchId: string;
  phone: string;
}

/** Live-checked as the Add Lead form's phone field is typed — a non-blocking warning, never a hard reject. */
export class CheckDuplicateLeadsUseCase implements UseCase<CheckDuplicateLeadsInput, LeadSummary[]> {
  constructor(private readonly leads: LeadRepository) {}

  async execute(input: CheckDuplicateLeadsInput): Promise<Result<LeadSummary[]>> {
    if (!input.phone.trim()) {
      return ok([]);
    }
    return this.leads.findDuplicatesByPhone(input.branchId, input.phone.trim());
  }
}
