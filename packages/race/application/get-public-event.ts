import { domainError, err, ok } from "../kernel";
import type { Result, UseCase } from "../kernel";
import type { RaceRegistrationRepository } from "../domain/race-registration-repository";
import type { PublicRaceEvent } from "../domain/registration";

/** Looks an event up by its public slug. Draft events are invisible to the public (staff see their own). */
export class GetPublicEventUseCase implements UseCase<string, PublicRaceEvent> {
  constructor(private readonly registrations: RaceRegistrationRepository) {}

  async execute(slug: string): Promise<Result<PublicRaceEvent>> {
    const trimmed = slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(trimmed)) {
      return err(domainError("RACE_NOT_FOUND", "Event not found."));
    }
    const result = await this.registrations.getPublicEvent(trimmed);
    if (result.isErr) return result;
    if (result.value === null) return err(domainError("RACE_NOT_FOUND", "Event not found."));
    return ok(result.value);
  }
}
