import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { RenewMembershipInput, RenewMembershipOutput } from "../domain/renewal";
import type { RenewalRepository } from "../domain/renewal-repository";

/**
 * The one-click "Renew" action's use case. Mirrors
 * RegisterMembershipUseCase's validation shape — cheap, obvious rejections
 * only; the DB (supabase/migrations/20260806000005) owns the rest
 * (unknown/inactive membership type, unique receipt number).
 */
export class RenewMembershipUseCase implements UseCase<RenewMembershipInput, RenewMembershipOutput> {
  constructor(private readonly renewals: RenewalRepository) {}

  async execute(input: RenewMembershipInput): Promise<Result<RenewMembershipOutput>> {
    if (!input.receiptNumber.trim()) {
      return err(domainError("RECEIPT_NUMBER_REQUIRED", "Receipt number is required."));
    }
    if (input.price < 0) {
      return err(domainError("INVALID_PRICE", "Price cannot be negative."));
    }
    if (input.discount < 0 || input.discount > input.price) {
      return err(domainError("INVALID_DISCOUNT", "Discount must be between 0 and the price."));
    }

    return this.renewals.renew(input);
  }
}
