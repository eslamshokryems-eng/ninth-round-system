import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { RaceRegistrationRepository } from "../domain/race-registration-repository";
import type { CheckInResult } from "../domain/registration";

/**
 * Reception checks an athlete in. The ONLY input is which athlete — never a
 * position, time or order: the server stamps the time and decides the start order.
 */
export class CheckInAthleteUseCase implements UseCase<string, CheckInResult> {
  constructor(private readonly registrations: RaceRegistrationRepository) {}

  async execute(registrationId: string): Promise<Result<CheckInResult>> {
    if (registrationId.trim() === "") {
      return err(domainError("RACE_NOT_FOUND", "Choose an athlete first."));
    }
    return this.registrations.checkIn(registrationId);
  }
}
