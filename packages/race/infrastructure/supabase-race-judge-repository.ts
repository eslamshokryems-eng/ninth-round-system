import { err, ok } from "../kernel";
import type { Result } from "../kernel";
import type { RaceStationViewJson, RaceRecordActionRow } from "./race-database";
import type { RaceSupabaseClient } from "./race-client";
import type { RecordActionInput, RecordActionResult, ReviewDecision, ScoreTally, StationView } from "../domain/judge";
import type { RaceJudgeRepository } from "../domain/race-judge-repository";
import { toRaceError } from "./supabase-race-registration-repository";

export function toTally(t: Record<string, unknown> | null | undefined): ScoreTally {
  const x = t ?? {};
  const num = (k: string): number | undefined => (typeof x[k] === "number" ? (x[k] as number) : undefined);
  return {
    ...(num("reps") !== undefined ? { reps: num("reps")! } : {}),
    ...(num("no_reps") !== undefined ? { noReps: num("no_reps")! } : {}),
    ...(num("laps") !== undefined ? { laps: num("laps")! } : {}),
    ...(num("penalty") !== undefined ? { penalty: num("penalty")! } : {}),
    ...(num("hold_ms") !== undefined ? { holdMs: num("hold_ms")! } : {}),
    technique: typeof x.technique === "number" ? x.technique : null,
    ...(num("pending_review") !== undefined ? { pendingReview: num("pending_review")! } : {}),
    ...(num("rejected") !== undefined ? { rejected: num("rejected")! } : {}),
    ...(typeof x.scoring_type === "string" ? { scoringType: x.scoring_type } : {}),
    score: typeof x.score === "number" ? x.score : null,
  };
}

export function toRecordResult(row: RaceRecordActionRow): RecordActionResult {
  return {
    performanceEventId: row.performance_event_id,
    status: row.status,
    rejectionCode: row.rejection_code,
    serverRaceMs: row.server_race_ms,
    duplicate: row.duplicate,
    tally: toTally(row.tally),
  };
}

export function toStationView(j: RaceStationViewJson): StationView {
  return {
    serverTime: j.server_time,
    station: { number: j.station.number, name: j.station.name, hasTechnique: j.station.has_technique },
    clock: { started: j.clock.started, paused: j.clock.paused, finished: j.clock.finished, raceMs: j.clock.race_ms, version: j.clock.version },
    current: j.current
      ? {
          resultId: j.current.result_id,
          raceNumber: j.current.race_number,
          fullName: j.current.full_name,
          categoryCode: j.current.category_code,
          movement: j.current.movement,
          state: j.current.state,
          windowStartMs: j.current.window_start_ms,
          windowEndMs: j.current.window_end_ms,
          scoringEndMs: j.current.scoring_end_ms,
          remainingMs: j.current.remaining_ms,
          tally: toTally(j.current.tally),
        }
      : null,
    next: j.next ? { raceNumber: j.next.race_number, fullName: j.next.full_name, startsInMs: j.next.starts_in_ms } : null,
  };
}

export class SupabaseRaceJudgeRepository implements RaceJudgeRepository {
  constructor(private readonly client: RaceSupabaseClient) {}

  async recordAction(input: RecordActionInput): Promise<Result<RecordActionResult>> {
    const { data, error } = await this.client
      .rpc("race_record_action", {
        p_station_result_id: input.resultId,
        p_type: input.type,
        p_client_event_id: input.clientEventId,
        p_value: input.value ?? null,
        p_origin: input.origin,
        p_device_recorded_at: input.deviceRecordedAt ?? null,
        p_device_race_ms: input.deviceRaceMs ?? null,
        p_device_seq: input.deviceSeq ?? null,
        p_voids_event_id: input.voidsEventId ?? null,
      })
      .single();
    if (error) return err(toRaceError(error));
    return ok(toRecordResult(data as RaceRecordActionRow));
  }

  async reviewAction(performanceEventId: string, decision: ReviewDecision, reason: string): Promise<Result<ScoreTally>> {
    const { data, error } = await this.client.rpc("race_review_action", { p_performance_event_id: performanceEventId, p_decision: decision, p_reason: reason });
    if (error) return err(toRaceError(error));
    return ok(toTally(data as Record<string, unknown>));
  }

  async stationView(eventId: string, stationNumber: number): Promise<Result<StationView>> {
    const { data, error } = await this.client.rpc("race_station_view", { p_event_id: eventId, p_station_number: stationNumber });
    if (error) return err(toRaceError(error));
    return ok(toStationView(data as RaceStationViewJson));
  }
}
