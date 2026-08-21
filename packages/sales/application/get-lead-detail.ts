import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeadDetail } from "../domain/lead";
import type { LeadRepository } from "../domain/lead-repository";

export class GetLeadDetailUseCase implements UseCase<string, LeadDetail> {
  constructor(private readonly leads: LeadRepository) {}

  async execute(leadId: string): Promise<Result<LeadDetail>> {
    return this.leads.getDetail(leadId);
  }
}
