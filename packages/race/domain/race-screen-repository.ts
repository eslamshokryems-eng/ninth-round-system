import type { Result } from "../kernel";
import type { StationScreenData } from "./station-screen";

/** The ONE call a Station Screen is allowed to make. */
export interface RaceScreenRepository {
  stationScreen(eventId: string, stationNumber: number): Promise<Result<StationScreenData>>;
}
