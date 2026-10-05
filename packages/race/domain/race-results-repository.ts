import type { Result } from "../kernel";
import type { AthleteResults, CorrectableField, Leaderboard, SnapshotInfo } from "./ranking";

export interface RaceResultsRepository {
  leaderboard(eventId: string, categoryCode?: string): Promise<Result<Leaderboard>>;
  computeRankings(eventId: string, categoryId?: string): Promise<Result<SnapshotInfo[]>>;
  publishResults(eventId: string): Promise<Result<{ status: string; already: boolean }>>;
  athleteResults(eventId: string, raceNumber: string): Promise<Result<AthleteResults>>;
  correctResult(resultId: string, field: CorrectableField, value: number, reason: string): Promise<Result<{ old: number | null; new: number; snapshot: SnapshotInfo | null }>>;
}
