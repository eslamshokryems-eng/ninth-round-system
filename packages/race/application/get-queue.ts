import type { Result, UseCase } from "@9thround/shared-kernel";
import type { RaceRegistrationRepository } from "../domain/race-registration-repository";
import type { QueueEntry } from "../domain/registration";

export interface GetQueueInput {
  eventId: string;
  /** Limit to one heat; omit for every heat. */
  heatNumber?: number;
}

/** The start queue, in server-decided order, with each athlete's bound or projected slot. */
export class GetQueueUseCase implements UseCase<GetQueueInput, QueueEntry[]> {
  constructor(private readonly registrations: RaceRegistrationRepository) {}

  async execute(input: GetQueueInput): Promise<Result<QueueEntry[]>> {
    return this.registrations.queue(input.eventId, input.heatNumber ?? null);
  }
}
