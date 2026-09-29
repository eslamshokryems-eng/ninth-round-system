import { domainError, err } from "../kernel";
import type { Result, UseCase } from "../kernel";
import type { RaceRegistrationRepository } from "../domain/race-registration-repository";

export interface RefundPaymentInput {
  paymentId: string;
  reason: string;
}

/** Refund a PAID payment (Event Manager). Cancels the registration and frees the heat seat; refused once the athlete is checked in. */
export class RefundPaymentUseCase implements UseCase<RefundPaymentInput, true> {
  constructor(private readonly registrations: RaceRegistrationRepository) {}

  async execute(input: RefundPaymentInput): Promise<Result<true>> {
    const reason = input.reason.trim();
    if (reason === "") {
      return err(domainError("RACE_REASON_REQUIRED", "A reason is required."));
    }
    return this.registrations.refundPayment(input.paymentId, reason);
  }
}
