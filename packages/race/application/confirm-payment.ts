import { domainError, err } from "../kernel";
import type { Result, UseCase } from "../kernel";
import type { RaceRegistrationRepository } from "../domain/race-registration-repository";
import type { ConfirmPaymentInput } from "../domain/registration";

/** Manual payment confirmation (pilot MVP). Retries with the same idempotency key never record a second payment. */
export class ConfirmPaymentUseCase implements UseCase<ConfirmPaymentInput, string> {
  constructor(private readonly registrations: RaceRegistrationRepository) {}

  async execute(input: ConfirmPaymentInput): Promise<Result<string>> {
    if (input.idempotencyKey.trim() === "") {
      return err(domainError("RACE_REASON_REQUIRED", "Missing idempotency key."));
    }
    if (input.amount !== null && (!Number.isFinite(input.amount) || input.amount < 0)) {
      return err(domainError("RACE_AMOUNT_MISMATCH", "Enter a valid amount."));
    }
    return this.registrations.confirmPayment({ ...input, notes: input.notes?.trim() || null });
  }
}
