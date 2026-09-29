import type { Result, UseCase } from "../kernel";
import type { RaceRegistrationRepository } from "../domain/race-registration-repository";
import type { RegisterAthleteInput, RegistrationConfirmation } from "../domain/registration";
import { validateRegistration } from "../domain/registration-validation";

/** Reception / Event Manager registers a phone or walk-in athlete (until heats are locked). Same rules as online. */
export class StaffRegisterAthleteUseCase implements UseCase<RegisterAthleteInput, RegistrationConfirmation> {
  constructor(private readonly registrations: RaceRegistrationRepository) {}

  async execute(input: RegisterAthleteInput): Promise<Result<RegistrationConfirmation>> {
    const valid = validateRegistration(input);
    if (valid.isErr) return valid;
    const { eventDate: _eventDate, ...command } = input;
    return this.registrations.staffRegister({
      ...command,
      fullName: command.fullName.trim(),
      email: command.email?.trim() || null,
    });
  }
}
