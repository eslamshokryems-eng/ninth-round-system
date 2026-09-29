import type { Result, UseCase } from "../kernel";
import type { RaceRegistrationRepository } from "../domain/race-registration-repository";
import type { StaffRegistrationRow } from "../domain/registration";

export interface ListRegistrationsInput {
  eventId: string;
  /** Race number first ("27", "N027"), then phone, then name. Empty = everyone. */
  query?: string;
  limit?: number;
}

export class ListRegistrationsUseCase implements UseCase<ListRegistrationsInput, StaffRegistrationRow[]> {
  constructor(private readonly registrations: RaceRegistrationRepository) {}

  async execute(input: ListRegistrationsInput): Promise<Result<StaffRegistrationRow[]>> {
    const query = input.query?.trim() ?? "";
    return this.registrations.list(input.eventId, query === "" ? null : query, input.limit ?? 200);
  }
}
