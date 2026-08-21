import type { Result, UseCase } from "@9thround/shared-kernel";
import type { LeadSummary } from "../domain/lead";
import type { LeadRepository } from "../domain/lead-repository";

// No input: RLS scopes the query to the caller (own assigned leads, or every branch lead for a manager/admin).
export type ListLeadsInput = Record<string, never>;

export class ListLeadsUseCase implements UseCase<ListLeadsInput, LeadSummary[]> {
  constructor(private readonly leads: LeadRepository) {}

  async execute(): Promise<Result<LeadSummary[]>> {
    return this.leads.list();
  }
}
