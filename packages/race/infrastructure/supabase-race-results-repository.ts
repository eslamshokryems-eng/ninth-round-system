import { err, ok } from "../kernel";
import type { Result } from "../kernel";
import type { RaceAthleteResultsJson, RaceLeaderboardJson, RaceSnapshotJson } from "./race-database";
import type { RaceSupabaseClient } from "./race-client";
import type { AthleteResults, CorrectableField, Leaderboard, SnapshotInfo } from "../domain/ranking";
import type { RaceResultsRepository } from "../domain/race-results-repository";
import { toRaceError } from "./supabase-race-registration-repository";

export function toLeaderboard(j: RaceLeaderboardJson): Leaderboard {
  if (!j.available) return { available: false };
  return {
    available: true,
    serverTime: j.server_time ?? "",
    eventName: j.event?.name ?? "",
    official: j.official === true,
    categories: (j.categories ?? []).map((c) => ({
      code: c.code,
      name: c.name,
      state: c.state,
      version: c.version,
      racing: c.racing,
      rows: c.rows.map((r) => ({
        rank: r.rank,
        raceNumber: r.race_number,
        name: r.name,
        totalPoints: r.total_points,
        placements: Object.fromEntries(Object.entries(r.placements).map(([k, v]) => [Number(k), v])),
        techniqueS04: r.tb_s04,
        techniqueS07: r.tb_s07,
      })),
      excluded: c.excluded.map((x) => ({ raceNumber: x.race_number, name: x.name, status: x.status })),
    })),
  };
}

export function toSnapshot(j: RaceSnapshotJson): SnapshotInfo {
  return {
    categoryId: j.category_id,
    version: j.version,
    official: j.official,
    unchanged: j.unchanged,
    ranked: j.ranked,
    blockers: { ranked: j.blockers.ranked, racing: j.blockers.racing, pendingReview: j.blockers.pending_review, notLocked: j.blockers.not_locked, unscored: j.blockers.unscored, pendingEvidence: j.blockers.pending_evidence ?? 0 },
  };
}

export function toAthleteResults(j: RaceAthleteResultsJson): AthleteResults {
  return {
    raceNumber: j.race_number,
    name: j.name,
    categoryCode: j.category_code,
    raceStatus: j.race_status,
    results: j.results.map((r) => ({
      resultId: r.result_id,
      station: r.station,
      stationName: r.station_name,
      status: r.status,
      officialScore: r.official_score,
      techniqueScore: r.technique_score,
      hasTechnique: r.has_technique,
    })),
  };
}

export class SupabaseRaceResultsRepository implements RaceResultsRepository {
  constructor(private readonly client: RaceSupabaseClient) {}

  async leaderboard(eventId: string, categoryCode?: string): Promise<Result<Leaderboard>> {
    const { data, error } = await this.client.rpc("race_leaderboard", { p_event_id: eventId, p_category_code: categoryCode ?? null });
    if (error) return err(toRaceError(error));
    return ok(toLeaderboard(data as RaceLeaderboardJson));
  }

  async computeRankings(eventId: string, categoryId?: string): Promise<Result<SnapshotInfo[]>> {
    const { data, error } = await this.client.rpc("race_compute_rankings", { p_event_id: eventId, p_category_id: categoryId ?? null, p_official: false });
    if (error) return err(toRaceError(error));
    return ok((data as { categories: RaceSnapshotJson[] }).categories.map(toSnapshot));
  }

  async publishResults(eventId: string): Promise<Result<{ status: string; already: boolean }>> {
    const { data, error } = await this.client.rpc("race_publish_results", { p_event_id: eventId });
    if (error) return err(toRaceError(error));
    const d = data as { status: string; already: boolean };
    return ok({ status: d.status, already: d.already });
  }

  async athleteResults(eventId: string, raceNumber: string): Promise<Result<AthleteResults>> {
    const { data, error } = await this.client.rpc("race_athlete_results", { p_event_id: eventId, p_race_number: raceNumber });
    if (error) return err(toRaceError(error));
    return ok(toAthleteResults(data as RaceAthleteResultsJson));
  }

  async correctResult(resultId: string, field: CorrectableField, value: number, reason: string) {
    const { data, error } = await this.client.rpc("race_correct_station_result", { p_result_id: resultId, p_field: field, p_value: value, p_reason: reason });
    if (error) return err(toRaceError(error));
    const d = data as { old: number | null; new: number; snapshot: RaceSnapshotJson | null };
    return ok({ old: d.old, new: d.new, snapshot: d.snapshot ? toSnapshot(d.snapshot) : null });
  }
}
