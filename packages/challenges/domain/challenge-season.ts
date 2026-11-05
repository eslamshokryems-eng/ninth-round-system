import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";

export type ChallengeSeasonStatus = "draft" | "active" | "completed" | "archived";

/** Every challenge belongs to exactly one season; points/leaderboards never mix across seasons (9TH ROUND CHALLENGES spec §2.4). */
export interface ChallengeSeason {
  seasonId: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  status: ChallengeSeasonStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChallengeSeasonInput {
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
}

/** Pure validation — the database is the final authority (a check constraint mirrors this), but failing fast here keeps the error user-facing rather than a raw Postgres message. */
export function validateChallengeSeasonDates(startsAt: string, endsAt: string): Result<void> {
  const start = new Date(startsAt);
  const end = new Date(endsAt);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return err(domainError("INVALID_SEASON_DATES", "Season start/end dates must be valid dates."));
  }
  if (end <= start) {
    return err(domainError("INVALID_SEASON_RANGE", "A season's end date must be after its start date."));
  }
  return ok(undefined);
}
