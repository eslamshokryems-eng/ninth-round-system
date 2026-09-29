import type { Result, UseCase } from "@9thround/shared-kernel";
import type { RaceRegistrationRepository } from "../domain/race-registration-repository";
import type { RegisterAthleteInput, RegistrationConfirmation } from "../domain/registration";
import { validateRegistration } from "../domain/registration-validation";

/**
 * Public online registration. Validates first for instant feedback, then the
 * database re-validates everything (it is the authority) and issues the race number.
 */
export class RegisterAthleteUseCase implements UseCase<RegisterAthleteInput, RegistrationConfirmation> {
  constructor(private readonly registrations: RaceRegistrationRepository) {}

  async execute(input: RegisterAthleteInput): Promise<Result<RegistrationConfirmation>> {
    const valid = validateRegistration(input);
    if (valid.isErr) return valid;
    const { eventDate: _eventDate, ...command } = input;
    return this.registrations.register({
      ...command,
      fullName: command.fullName.trim(),
      email: command.email?.trim() || null,
    });
  }
}
