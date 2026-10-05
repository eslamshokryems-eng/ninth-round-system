import { domainError, err } from "../kernel";
import type { Result, UseCase } from "../kernel";
import type { AthleteResults, CorrectableField, Leaderboard, SnapshotInfo } from "../domain/ranking";
import type { RaceResultsRepository } from "../domain/race-results-repository";

export class GetLeaderboardUseCase implements UseCase<{ eventId: string; categoryCode?: string }, Leaderboard> {
  constructor(private readonly results: RaceResultsRepository) {}
  execute(input: { eventId: string; categoryCode?: string }): Promise<Result<Leaderboard>> {
    return this.results.leaderboard(input.eventId, input.categoryCode);
  }
}

/** Saves a PROVISIONAL snapshot. Making results official is a separate, deliberate step (PublishResultsUseCase). */
export class ComputeRankingsUseCase implements UseCase<{ eventId: string; categoryId?: string }, SnapshotInfo[]> {
  constructor(private readonly results: RaceResultsRepository) {}
  execute(input: { eventId: string; categoryId?: string }): Promise<Result<SnapshotInfo[]>> {
    return this.results.computeRankings(input.eventId, input.categoryId);
  }
}

export class PublishResultsUseCase implements UseCase<{ eventId: string }, { status: string; already: boolean }> {
  constructor(private readonly results: RaceResultsRepository) {}
  execute(input: { eventId: string }) {
    return this.results.publishResults(input.eventId);
  }
}

export class GetAthleteResultsUseCase implements UseCase<{ eventId: string; raceNumber: string }, AthleteResults> {
  constructor(private readonly results: RaceResultsRepository) {}
  async execute(input: { eventId: string; raceNumber: string }): Promise<Result<AthleteResults>> {
    const n = input.raceNumber.trim();
    if (!/^N?[0-9]{1,4}$/i.test(n)) return err(domainError("RACE_NOT_FOUND", "Enter a race number like N012."));
    const padded = /^[0-9]+$/.test(n) ? `N${n.padStart(3, "0")}` : n.toUpperCase().replace(/^N([0-9]{1,2})$/, (_m, d: string) => `N${d.padStart(3, "0")}`);
    return this.results.athleteResults(input.eventId, padded);
  }
}

export interface CorrectResultInput {
  resultId: string;
  field: CorrectableField;
  value: number;
  reason: string;
}
export class CorrectResultUseCase implements UseCase<CorrectResultInput, { old: number | null; new: number; snapshot: SnapshotInfo | null }> {
  constructor(private readonly results: RaceResultsRepository) {}
  async execute(input: CorrectResultInput) {
    if (input.reason.trim() === "") return err(domainError("RACE_REASON_REQUIRED", "Write why this result is being corrected — it goes in the audit log."));
    if (!Number.isFinite(input.value) || input.value < 0) return err(domainError("RACE_INVALID_VALUE", "A score is zero or more."));
    if (input.field === "technique_score" && (input.value > 10 || Math.abs(input.value * 10 - Math.round(input.value * 10)) > 1e-9)) {
      return err(domainError("RACE_INVALID_VALUE", "A technique score is 0–10 in steps of 0.1."));
    }
    return this.results.correctResult(input.resultId, input.field, input.value, input.reason.trim());
  }
}
