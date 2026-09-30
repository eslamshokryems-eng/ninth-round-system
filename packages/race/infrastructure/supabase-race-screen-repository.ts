import { err, ok } from "../kernel";
import type { Result } from "../kernel";
import type { RaceStationScreenJson } from "./race-database";
import type { RaceSupabaseClient } from "./race-client";
import type { StationScreenData } from "../domain/station-screen";
import type { RaceScreenRepository } from "../domain/race-screen-repository";
import { toRaceError } from "./supabase-race-registration-repository";

export function toStationScreen(j: RaceStationScreenJson): StationScreenData {
  return {
    serverTime: j.server_time,
    eventName: j.event.name,
    station: { number: j.station.number, name: j.station.name, isLast: j.station.is_last },
    clock: { started: j.clock.started, paused: j.clock.paused, finished: j.clock.finished, raceMs: j.clock.race_ms, version: j.clock.version },
    timing: { workMs: j.timing.work_ms, transitionMs: j.timing.transition_ms, getReadyMs: j.timing.get_ready_ms },
    current: j.current
      ? {
          raceNumber: j.current.race_number,
          categoryCode: j.current.category_code,
          windowStartMs: j.current.window_start_ms,
          windowEndMs: j.current.window_end_ms,
          scoringEndMs: j.current.scoring_end_ms,
          scoringType: j.current.scoring_type,
          score: j.current.score,
        }
      : null,
    upcoming: j.upcoming ? { raceNumber: j.upcoming.race_number, categoryCode: j.upcoming.category_code, windowStartMs: j.upcoming.window_start_ms } : null,
    plannedNextMs: j.planned_next_ms,
    servedAny: j.served_any,
  };
}

export class SupabaseRaceScreenRepository implements RaceScreenRepository {
  constructor(private readonly client: RaceSupabaseClient) {}
  async stationScreen(eventId: string, stationNumber: number): Promise<Result<StationScreenData>> {
    const { data, error } = await this.client.rpc("race_station_screen", { p_event_id: eventId, p_station_number: stationNumber });
    if (error) return err(toRaceError(error));
    return ok(toStationScreen(data as RaceStationScreenJson));
  }
}
