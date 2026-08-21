import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { ConvertLeadInput, ConvertLeadOutput } from "../domain/lead";
import type { LeadRepository } from "../domain/lead-repository";

/**
 * Convert-to-Member. Does NOT re-implement registration — the repository
 * calls the existing convert_lead_to_member() RPC, which itself calls the
 * production register_membership() unchanged (supabase/migrations/
 * 20260821000001_sales_leads_crm.sql). This use case only validates what's
 * cheap to reject before the round trip, same posture as
 * RegisterMembershipUseCase.
 */
export class ConvertLeadUseCase implements UseCase<ConvertLeadInput, ConvertLeadOutput> {
  constructor(private readonly leads: LeadRepository) {}

  async execute(input: ConvertLeadInput): Promise<Result<ConvertLeadOutput>> {
    if (!input.receiptNumber.trim()) {
      return err(domainError("RECEIPT_NUMBER_REQUIRED", "Receipt number is required."));
    }
    if (input.price < 0) {
      return err(domainError("INVALID_PRICE", "Price cannot be negative."));
    }
    if (input.discount < 0 || input.discount > input.price) {
      return err(domainError("INVALID_DISCOUNT", "Discount must be between 0 and the price."));
    }

    return this.leads.convert(input);
  }
}
