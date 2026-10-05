import { describe, expect, it, vi } from "vitest";
import { ok } from "../kernel";
import type { RaceResultsRepository } from "../domain/race-results-repository";
import { CorrectResultUseCase, GetAthleteResultsUseCase } from "./results-use-cases";
import { blockersClear, describeBlockers, placeLabel } from "../domain/ranking";
import type { RankRow } from "../domain/ranking";
import { toAthleteResults, toLeaderboard, toSnapshot } from "../infrastructure/supabase-race-results-repository";

const repo = (): RaceResultsRepository & { calls: unknown[][] } => {
  const calls: unknown[][] = [];
  return {
    calls,
    leaderboard: vi.fn(),
    computeRankings: vi.fn(),
    publishResults: vi.fn(),
    athleteResults: vi.fn(async (...a: unknown[]) => { calls.push(a); return ok({ raceNumber: "N012", name: "A", categoryCode: "MEN", raceStatus: "FINISHED", results: [] }); }),
    correctResult: vi.fn(async (...a: unknown[]) => { calls.push(a); return ok({ old: 1, new: 2, snapshot: null }); }),
  } as never;
};

describe("CorrectResultUseCase", () => {
  it("refuses a missing reason, a negative value and a bad technique score before any call", async () => {
    const r = repo(); const uc = new CorrectResultUseCase(r);
    expect((await uc.execute({ resultId: "x", field: "official_score", value: 5, reason: "  " })).isErr).toBe(true);
    const neg = await uc.execute({ resultId: "x", field: "official_score", value: -1, reason: "why" });
    expect(neg.isErr && neg.error.code).toBe("RACE_INVALID_VALUE");
    const hi = await uc.execute({ resultId: "x", field: "technique_score", value: 10.5, reason: "why" });
    expect(hi.isErr && hi.error.code).toBe("RACE_INVALID_VALUE");
    const step = await uc.execute({ resultId: "x", field: "technique_score", value: 7.25, reason: "why" });
    expect(step.isErr && step.error.code).toBe("RACE_INVALID_VALUE");
    expect(r.calls).toHaveLength(0);
  });
  it("passes a valid correction with the trimmed reason", async () => {
    const r = repo(); const uc = new CorrectResultUseCase(r);
    expect((await uc.execute({ resultId: "x", field: "technique_score", value: 7.5, reason: " video review " })).isOk).toBe(true);
    expect(r.calls[0]).toEqual(["x", "technique_score", 7.5, "video review"]);
  });
});

describe("GetAthleteResultsUseCase", () => {
  it("normalises race numbers: 12, n12 and N012 are the same athlete", async () => {
    for (const input of ["12", "n12", "N012", " 12 "]) {
      const r = repo(); await new GetAthleteResultsUseCase(r).execute({ eventId: "e", raceNumber: input });
      expect(r.calls[0]).toEqual(["e", "N012"]);
    }
    const bad = await new GetAthleteResultsUseCase(repo()).execute({ eventId: "e", raceNumber: "abc" });
    expect(bad.isErr).toBe(true);
  });
});

describe("ranking helpers", () => {
  const row = (rank: number, n: string): RankRow => ({ rank, raceNumber: n, name: "A B.", totalPoints: 9, placements: {}, techniqueS04: null, techniqueS07: null });
  it("a shared place is shown with a T", () => {
    const rows = [row(1, "N001"), row(2, "N002"), row(2, "N003"), row(4, "N004")];
    expect(rows.map((r) => placeLabel(rows, r))).toEqual(["1", "T2", "T2", "4"]);
  });
  it("blockers", () => {
    expect(blockersClear({ ranked: 5, racing: 0, pendingReview: 0, notLocked: 0, unscored: 0 })).toBe(true);
    const b = { ranked: 5, racing: 2, pendingReview: 1, notLocked: 0, unscored: 3 };
    expect(blockersClear(b)).toBe(false);
    expect(describeBlockers(b)).toEqual(["2 athletes are still racing", "1 result is waiting for a Master Control review", "3 results have no score"]);
  });
});

describe("mappers", () => {
  it("maps the leaderboard, turning station keys into numbers", () => {
    const lb = toLeaderboard({ available: true, server_time: "t", event: { name: "THE NINTH" }, official: false, categories: [{ code: "MEN", name: "Men", state: "PROVISIONAL", version: null, racing: 2,
      rows: [{ rank: 1, race_number: "N001", name: "Ahmed A.", total_points: 12, placements: { "1": 1, "2": 3 }, tb_s04: 8, tb_s07: null }], excluded: [{ race_number: "N030", name: "Omar F.", status: "DNF" }] }] });
    expect(lb).toMatchObject({ available: true, official: false });
    if (lb.available) {
      expect(lb.categories[0]!.rows[0]).toEqual({ rank: 1, raceNumber: "N001", name: "Ahmed A.", totalPoints: 12, placements: { 1: 1, 2: 3 }, techniqueS04: 8, techniqueS07: null });
      expect(lb.categories[0]!.excluded[0]).toEqual({ raceNumber: "N030", name: "Omar F.", status: "DNF" });
    }
    expect(toLeaderboard({ available: false })).toEqual({ available: false });
  });
  it("maps snapshots and athlete results", () => {
    expect(toSnapshot({ category_id: "c", version: 2, official: true, unchanged: false, ranked: 9, blockers: { ranked: 9, racing: 0, pending_review: 1, not_locked: 2, unscored: 3 } }).blockers).toEqual({ ranked: 9, racing: 0, pendingReview: 1, notLocked: 2, unscored: 3 });
    expect(toAthleteResults({ race_number: "N001", name: "A", category_code: "MEN", race_status: "FINISHED", results: [{ result_id: "r", station: 4, station_name: "Jab", status: "LOCKED", official_score: 3, technique_score: 8, has_technique: true }] }).results[0]).toMatchObject({ resultId: "r", hasTechnique: true, techniqueScore: 8 });
  });
});
