import { domainError, err } from "../kernel";
import type { Result, UseCase } from "../kernel";
import type { RaceRegistrationRepository } from "../domain/race-registration-repository";

export interface CancelRegistrationInput {
  registrationId: string;
  reason: string;
}

/** Cancel a registration (Event Manager). A paid registration must be refunded first; the race number stays reserved. */
export class CancelRegistrationUseCase implements UseCase<CancelRegistrationInput, true> {
  constructor(private readonly registrations: RaceRegistrationRepository) {}

  async execute(input: CancelRegistrationInput): Promise<Result<true>> {
    const reason = input.reason.trim();
    if (reason === "") {
      return err(domainError("RACE_REASON_REQUIRED", "A reason is required."));
    }
    return this.registrations.cancelRegistration(input.registrationId, reason);
  }
}
