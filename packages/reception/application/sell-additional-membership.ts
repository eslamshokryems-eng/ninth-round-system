import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { SellAdditionalMembershipInput, SellAdditionalMembershipOutput } from "../domain/additional-membership";
import type { AdditionalMembershipRepository } from "../domain/additional-membership-repository";

/**
 * Sells a new, concurrent membership (e.g. a Personal Training package) to
 * an existing member. Mirrors RenewMembershipUseCase's validation shape —
 * cheap, obvious rejections only; the DB (supabase/migrations/
 * 20260915000001) owns the rest (unknown/inactive membership type, unique
 * receipt number, one active membership per type).
 */
export class SellAdditionalMembershipUseCase
  implements UseCase<SellAdditionalMembershipInput, SellAdditionalMembershipOutput>
{
  constructor(private readonly memberships: AdditionalMembershipRepository) {}

  async execute(input: SellAdditionalMembershipInput): Promise<Result<SellAdditionalMembershipOutput>> {
    if (!input.receiptNumber.trim()) {
      return err(domainError("RECEIPT_NUMBER_REQUIRED", "Receipt number is required."));
    }
    if (input.price < 0) {
      return err(domainError("INVALID_PRICE", "Price cannot be negative."));
    }
    if (input.discount < 0 || input.discount > input.price) {
      return err(domainError("INVALID_DISCOUNT", "Discount must be between 0 and the price."));
    }

    return this.memberships.sell(input);
  }
}
