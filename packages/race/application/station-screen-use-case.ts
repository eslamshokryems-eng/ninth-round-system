import { domainError, err } from "../kernel";
import type { Result, UseCase } from "../kernel";
import type { StationScreenData } from "../domain/station-screen";
import type { RaceScreenRepository } from "../domain/race-screen-repository";

export interface StationScreenInput {
  eventId: string;
  stationNumber: number;
}

/** Read-only by construction: this is the only use case a Station Screen page composes. */
export class GetStationScreenUseCase implements UseCase<StationScreenInput, StationScreenData> {
  constructor(private readonly screen: RaceScreenRepository) {}
  async execute(input: StationScreenInput): Promise<Result<StationScreenData>> {
    if (!Number.isInteger(input.stationNumber) || input.stationNumber < 1 || input.stationNumber > 9) {
      return err(domainError("RACE_NOT_FOUND", "Choose a station from 1 to 9."));
    }
    return this.screen.stationScreen(input.eventId, input.stationNumber);
  }
}
