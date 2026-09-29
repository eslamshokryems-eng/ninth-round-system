import { domainError, err, ok } from "../kernel";
import type { Result, UseCase } from "../kernel";
import type { RaceRegistrationRepository } from "../domain/race-registration-repository";
import type { MyRegistration } from "../domain/registration";

/** The athlete's confirmation page: race number, category, heat, status — looked up by their secret token. */
export class GetMyRegistrationUseCase implements UseCase<string, MyRegistration> {
  constructor(private readonly registrations: RaceRegistrationRepository) {}

  async execute(token: string): Promise<Result<MyRegistration>> {
    const trimmed = token.trim();
    if (trimmed.length < 32) {
      return err(domainError("RACE_NOT_FOUND", "This link is not valid."));
    }
    const result = await this.registrations.getMyRegistration(trimmed);
    if (result.isErr) return result;
    if (result.value === null) return err(domainError("RACE_NOT_FOUND", "This link is not valid."));
    return ok(result.value);
  }
}
