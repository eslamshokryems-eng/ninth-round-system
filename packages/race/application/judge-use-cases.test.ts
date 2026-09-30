import { describe, expect, it } from "vitest";
import { ok } from "../kernel";
import type { RaceJudgeRepository } from "../domain/race-judge-repository";
import { GetStationViewUseCase, RecordActionUseCase, ReviewActionUseCase } from "./judge-use-cases";
import { toRecordResult, toStationView, toTally } from "../infrastructure/supabase-race-judge-repository";

const ID = "11111111-1111-4111-8111-111111111111";
function fake() {
  const calls: unknown[] = [];
  const repo: RaceJudgeRepository = {
    recordAction: (i) => { calls.push(i); return Promise.resolve(ok({ performanceEventId: "e", status: "ACCEPTED" as const, rejectionCode: null, serverRaceMs: 1, duplicate: false, tally: {} })); },
    reviewAction: (a, d, r) => { calls.push([a, d, r]); return Promise.resolve(ok({})); },
    stationView: (e, n) => { calls.push([e, n]); return Promise.resolve(ok({} as never)); },
  };
  return { repo, calls };
}

describe("judge use cases", () => {
  it("refuses, before any request, an action without a proper client id", async () => {
    const { repo, calls } = fake();
    const r = await new RecordActionUseCase(repo).execute({ resultId: "r", type: "REP", clientEventId: "nope", origin: "ONLINE" });
    expect(r.isErr && r.error.code).toBe("RACE_CLIENT_EVENT_REQUIRED");
    expect(calls).toEqual([]);
  });
  it("validates technique range, VOID target and offline metadata locally", async () => {
    const { repo, calls } = fake();
    const uc = new RecordActionUseCase(repo);
    expect((await uc.execute({ resultId: "r", type: "TECHNIQUE_SCORE", clientEventId: ID, origin: "ONLINE", value: 11 })).isErr).toBe(true);
    expect((await uc.execute({ resultId: "r", type: "VOID", clientEventId: ID, origin: "ONLINE" })).isErr).toBe(true);
    expect((await uc.execute({ resultId: "r", type: "REP", clientEventId: ID, origin: "OFFLINE_QUEUE" })).isErr).toBe(true);
    expect((await uc.execute({ resultId: " ", type: "REP", clientEventId: ID, origin: "ONLINE" })).isErr).toBe(true);
    expect(calls).toEqual([]);
  });
  it("passes a good action straight through — the input has no time and no score field", async () => {
    const { repo, calls } = fake();
    await new RecordActionUseCase(repo).execute({ resultId: "r", type: "REP", clientEventId: ID, origin: "ONLINE" });
    expect(calls).toEqual([{ resultId: "r", type: "REP", clientEventId: ID, origin: "ONLINE" }]);
  });
  it("a review needs a written reason", async () => {
    const { repo, calls } = fake();
    expect((await new ReviewActionUseCase(repo).execute({ performanceEventId: "p", decision: "APPROVED", reason: " " })).isErr).toBe(true);
    await new ReviewActionUseCase(repo).execute({ performanceEventId: "p", decision: "APPROVED", reason: " ok " });
    expect(calls).toEqual([["p", "APPROVED", "ok"]]);
  });
  it("only stations 1–9 exist", async () => {
    const { repo } = fake();
    expect((await new GetStationViewUseCase(repo).execute({ eventId: "e", stationNumber: 10 })).isErr).toBe(true);
    expect((await new GetStationViewUseCase(repo).execute({ eventId: "e", stationNumber: 4 })).isOk).toBe(true);
  });
});

describe("judge mappers", () => {
  it("maps a tally, keeping unknowns out", () => {
    expect(toTally({ reps: 5, no_reps: 1, scoring_type: "REPS", score: 5, technique: null, pending_review: 0 }))
      .toEqual({ reps: 5, noReps: 1, scoringType: "REPS", score: 5, technique: null, pendingReview: 0 });
    expect(toTally(null)).toEqual({ technique: null, score: null });
  });
  it("maps a record result including the duplicate flag", () => {
    expect(toRecordResult({ performance_event_id: "e", status: "REJECTED", rejection_code: "WINDOW_CLOSED", server_race_ms: 240100, duplicate: true, tally: { score: 3 } }))
      .toEqual({ performanceEventId: "e", status: "REJECTED", rejectionCode: "WINDOW_CLOSED", serverRaceMs: 240100, duplicate: true, tally: { technique: null, score: 3 } });
  });
  it("maps a station view with and without an athlete", () => {
    const base = { server_time: "t", station: { number: 1, name: "Squat", has_technique: false }, clock: { started: true, paused: false, finished: false, race_ms: 61000, version: 1 } };
    expect(toStationView({ ...base, current: null, next: null }).current).toBeNull();
    const v = toStationView({ ...base, current: { result_id: "r", race_number: "N001", full_name: "A", category_code: "MEN", movement: "Barbell Squat", state: "WORK", window_start_ms: 60000, window_end_ms: 240000, scoring_end_ms: 270000, remaining_ms: 179000, tally: { reps: 2 } }, next: { race_number: "N002", full_name: "B", starts_in_ms: 5000 } });
    expect(v.current).toMatchObject({ raceNumber: "N001", state: "WORK", remainingMs: 179000, tally: { reps: 2 } });
    expect(v.next).toEqual({ raceNumber: "N002", fullName: "B", startsInMs: 5000 });
  });
});
