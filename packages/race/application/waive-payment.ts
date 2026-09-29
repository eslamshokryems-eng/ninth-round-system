import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { RaceRegistrationRepository } from "../domain/race-registration-repository";

export interface WaivePaymentInput {
  registrationId: string;
  reason: string;
}

/** Waive payment (Event Manager): the athlete is confirmed without paying; the reason is kept on the registration and in the audit log. */
export class WaivePaymentUseCase implements UseCase<WaivePaymentInput, true> {
  constructor(private readonly registrations: RaceRegistrationRepository) {}

  async execute(input: WaivePaymentInput): Promise<Result<true>> {
    const reason = input.reason.trim();
    if (reason === "") {
      return err(domainError("RACE_REASON_REQUIRED", "A reason is required."));
    }
    return this.registrations.waivePayment(input.registrationId, reason);
  }
}
