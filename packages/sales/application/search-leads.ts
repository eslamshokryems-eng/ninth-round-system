import { ok } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeadSummary } from "../domain/lead";
import type { LeadRepository } from "../domain/lead-repository";

export interface SearchLeadsInput {
  query: string;
}

export class SearchLeadsUseCase implements UseCase<SearchLeadsInput, LeadSummary[]> {
  constructor(private readonly leads: LeadRepository) {}

  async execute(input: SearchLeadsInput): Promise<Result<LeadSummary[]>> {
    if (input.query.trim().length < 2) {
      return ok([]);
    }
    return this.leads.search(input.query.trim());
  }
}
