import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { RegisterMembershipInput, RegisterMembershipOutput } from "../domain/registration";
import type { RegistrationRepository } from "../domain/registration-repository";

/**
 * The "+ New Membership" form's single use case. Field-level constraints
 * (unique phone, unique receipt number, price >= 0, valid membership type)
 * are enforced by the database (supabase/migrations/20260806000003) and
 * surfaced back through the repository's Result — this use case only
 * checks what's cheap and obvious to reject before a round trip, not a
 * restatement of every DB constraint.
 */
export class RegisterMembershipUseCase
  implements UseCase<RegisterMembershipInput, RegisterMembershipOutput>
{
  constructor(private readonly registrations: RegistrationRepository) {}

  async execute(input: RegisterMembershipInput): Promise<Result<RegisterMembershipOutput>> {
    if (!input.fullName.trim()) {
      return err(domainError("FULL_NAME_REQUIRED", "Full name is required."));
    }
    if (!input.phone.trim()) {
      return err(domainError("PHONE_REQUIRED", "Phone number is required."));
    }
    if (!input.receiptNumber.trim()) {
      return err(domainError("RECEIPT_NUMBER_REQUIRED", "Receipt number is required."));
    }
    if (input.price < 0) {
      return err(domainError("INVALID_PRICE", "Price cannot be negative."));
    }
    if (input.discount < 0 || input.discount > input.price) {
      return err(domainError("INVALID_DISCOUNT", "Discount must be between 0 and the price."));
    }

    return this.registrations.register(input);
  }
}
