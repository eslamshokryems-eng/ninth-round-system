import { describe, expect, it } from "vitest";
import { pointsForPlaceCents, rankResults, reconcileChallenge, scoreChallenge, selectCountedAttempt } from "./scoring";
import { PROVISIONAL_POINTS_SCHEDULE, PROVISIONAL_SEASON_RULES, type Attempt, type LedgerEntry, type SeasonRules } from "./types";

const A = (over: Partial<Attempt> & Pick<Attempt, "id" | "participantId" | "value">): Attempt => ({
  seasonId: "s", challengeId: "c1", unit: "reps", attemptNo: 1, attemptedAt: "2026-11-02T10:00:00Z", recordedBy: "judge", reviewedBy: "rev", status: "approved", reason: null, correctedFrom: null, clientRequestId: over.id, ...over,
});
const rules = (over: Partial<SeasonRules> = {}): SeasonRules => ({ ...PROVISIONAL_SEASON_RULES, ...over });
const base = { seasonId: "s", challengeId: "c1", counting: "BEST" as const };

describe("rankResults", () => {
  it("time: the lower valid time wins", () => {
    const r = rankResults([{ participantId: "a", value: 61 }, { participantId: "b", value: 59.5 }, { participantId: "c", value: 70 }], { direction: "LOWER_WINS" });
    expect(r.map((x) => [x.participantId, x.rank])).toEqual([["b", 1], ["a", 2], ["c", 3]]);
  });
  it("reps and distance: the higher valid result wins", () => {
    const r = rankResults([{ participantId: "a", value: 30 }, { participantId: "b", value: 42 }], { direction: "HIGHER_WINS" });
    expect(r[0]?.participantId).toBe("b");
  });
  it("equal results share a rank and the next rank is skipped (1, 2, 2, 4)", () => {
    const r = rankResults([{ participantId: "a", value: 10 }, { participantId: "b", value: 8 }, { participantId: "c", value: 8 }, { participantId: "d", value: 5 }], { direction: "HIGHER_WINS" });
    expect(r.map((x) => x.rank)).toEqual([1, 2, 2, 4]);
    expect(r[1]?.tieSize).toBe(2);
  });
  it("is deterministic regardless of input order", () => {
    const xs = [{ participantId: "c", value: 5 }, { participantId: "a", value: 5 }, { participantId: "b", value: 9 }];
    expect(rankResults(xs, { direction: "HIGHER_WINS" })).toEqual(rankResults([...xs].reverse(), { direction: "HIGHER_WINS" }));
  });
  it("handles no results", () => expect(rankResults([], { direction: "LOWER_WINS" })).toEqual([]));
});

describe("points", () => {
  it("reads the configured table, then `beyond`, never below the participation floor", () => {
    const s = { byRank: [10, 6, 3], beyond: 0.5, participation: 1, absent: 0 };
    expect([1, 2, 3, 4, 50].map((p) => pointsForPlaceCents(p, s))).toEqual([1000, 600, 300, 100, 100]);
  });
  it("SHARE gives every tied participant the points of the shared rank", () => {
    const e = scoreChallenge({ ...base, metric: { kind: "REPS", unit: "reps", direction: "HIGHER_WINS" }, rules: rules({ tiePolicy: "SHARE" }), eligibleParticipantIds: ["a", "b", "c"], attempts: [A({ id: "1", participantId: "a", value: 20 }), A({ id: "2", participantId: "b", value: 20 }), A({ id: "3", participantId: "c", value: 10 })] });
    const pts = Object.fromEntries(e.map((x) => [x.participantId, x.pointsCents]));
    expect(pts).toEqual({ a: 2500, b: 2500, c: 1600 });
  });
  it("SPLIT shares the average of the occupied places (25 + 20)/2 = 22.50", () => {
    const e = scoreChallenge({ ...base, metric: { kind: "REPS", unit: "reps", direction: "HIGHER_WINS" }, rules: rules({ tiePolicy: "SPLIT" }), eligibleParticipantIds: ["a", "b"], attempts: [A({ id: "1", participantId: "a", value: 20 }), A({ id: "2", participantId: "b", value: 20 })] });
    expect(e.map((x) => x.pointsCents)).toEqual([2250, 2250]);
  });
  it("SPLIT rounds half up to a hundredth, and totals can differ by a cent per group, never more", () => {
    const e = scoreChallenge({ ...base, metric: { kind: "REPS", unit: "reps", direction: "HIGHER_WINS" }, rules: rules({ tiePolicy: "SPLIT", points: { byRank: [10, 5, 4], beyond: 1, participation: 1, absent: 0 } }), eligibleParticipantIds: ["a", "b", "c"], attempts: ["a", "b", "c"].map((p, i) => A({ id: String(i), participantId: p, value: 7 })) });
    expect(e.map((x) => x.pointsCents)).toEqual([633, 633, 633]); // (1000+500+400)/3 = 6.3333
  });
});

describe("scoreChallenge", () => {
  const metric = { kind: "TIME" as const, unit: "s", direction: "LOWER_WINS" as const };
  it("ignores rejected, pending and void attempts", () => {
    const e = scoreChallenge({ ...base, metric, rules: rules(), eligibleParticipantIds: ["a", "b"], attempts: [A({ id: "1", participantId: "a", value: 50, status: "rejected" }), A({ id: "2", participantId: "a", value: 60, status: "pending" }), A({ id: "3", participantId: "b", value: 70 }), A({ id: "4", participantId: "a", value: 40, status: "void" })] });
    expect(e.filter((x) => x.reason === "AWARD").map((x) => x.participantId)).toEqual(["b"]);
  });
  it("ignores participants who are not eligible", () => {
    const e = scoreChallenge({ ...base, metric, rules: rules(), eligibleParticipantIds: ["a"], attempts: [A({ id: "1", participantId: "a", value: 70 }), A({ id: "2", participantId: "x", value: 10 })] });
    expect(e.map((x) => x.participantId)).toEqual(["a"]);
  });
  it("absence: ZERO awards nothing; PARTICIPATION awards the floor", () => {
    const attempts = [A({ id: "1", participantId: "a", value: 70 })];
    expect(scoreChallenge({ ...base, metric, rules: rules({ absencePolicy: "ZERO" }), eligibleParticipantIds: ["a", "b"], attempts }).map((x) => x.participantId)).toEqual(["a"]);
    const p = scoreChallenge({ ...base, metric, rules: rules({ absencePolicy: "PARTICIPATION" }), eligibleParticipantIds: ["a", "b"], attempts });
    expect(p.find((x) => x.participantId === "b")).toMatchObject({ pointsCents: 100, rank: null, reason: "ABSENT" });
  });
  it("a second attempt: BEST / LATEST / FIRST_APPROVED pick differently", () => {
    const list = [A({ id: "1", participantId: "a", value: 60, attemptNo: 1 }), A({ id: "2", participantId: "a", value: 55, attemptNo: 2, attemptedAt: "2026-11-02T11:00:00Z" }), A({ id: "3", participantId: "a", value: 58, attemptNo: 3, attemptedAt: "2026-11-02T12:00:00Z" })];
    expect(selectCountedAttempt(list, "BEST", metric)?.value).toBe(55);
    expect(selectCountedAttempt(list, "LATEST", metric)?.value).toBe(58);
    expect(selectCountedAttempt(list, "FIRST_APPROVED", metric)?.value).toBe(60);
    expect(selectCountedAttempt([], "BEST", metric)).toBeNull();
  });
  it("is deterministic for identical approved input", () => {
    const input = { ...base, metric, rules: rules(), eligibleParticipantIds: ["b", "a", "c"], attempts: [A({ id: "1", participantId: "a", value: 70 }), A({ id: "2", participantId: "b", value: 70 }), A({ id: "3", participantId: "c", value: 50 })] };
    expect(scoreChallenge(input)).toEqual(scoreChallenge({ ...input, eligibleParticipantIds: ["c", "a", "b"], attempts: [...input.attempts].reverse() }));
  });
});

describe("reconcileChallenge (append-only, exactly once)", () => {
  const metric = { kind: "REPS" as const, unit: "reps", direction: "HIGHER_WINS" as const };
  const input = (attempts: Attempt[]) => ({ ...base, metric, rules: rules(), eligibleParticipantIds: ["a", "b"], attempts });
  const apply = (ledger: LedgerEntry[], extra: LedgerEntry[]) => [...ledger, ...extra];
  it("the first run awards, a retry awards nothing more", () => {
    const attempts = [A({ id: "1", participantId: "a", value: 30 }), A({ id: "2", participantId: "b", value: 20 })];
    const l1 = apply([], reconcileChallenge([], scoreChallenge(input(attempts)), "c1", "s"));
    expect(l1.map((x) => x.pointsCents)).toEqual([2500, 2000]);
    expect(reconcileChallenge(l1, scoreChallenge(input(attempts)), "c1", "s")).toEqual([]);
  });
  it("a correction appends only the difference and the totals follow", () => {
    const attempts = [A({ id: "1", participantId: "a", value: 30 }), A({ id: "2", participantId: "b", value: 20 })];
    const l1 = apply([], reconcileChallenge([], scoreChallenge(input(attempts)), "c1", "s"));
    const corrected = [A({ id: "1", participantId: "a", value: 10 }), A({ id: "2", participantId: "b", value: 20 })]; // a drops below b
    const delta = reconcileChallenge(l1, scoreChallenge(input(corrected)), "c1", "s");
    expect(delta.map((x) => [x.participantId, x.pointsCents, x.rank])).toEqual([["a", -500, 2], ["b", 500, 1]]);
    const l2 = apply(l1, delta);
    expect(reconcileChallenge(l2, scoreChallenge(input(corrected)), "c1", "s")).toEqual([]);
  });
  it("a result that is rejected after the fact is reversed", () => {
    const attempts = [A({ id: "1", participantId: "a", value: 30 })];
    const l1 = apply([], reconcileChallenge([], scoreChallenge(input(attempts)), "c1", "s"));
    const delta = reconcileChallenge(l1, scoreChallenge(input([A({ id: "1", participantId: "a", value: 30, status: "rejected" })])), "c1", "s");
    expect(delta).toEqual([{ seasonId: "s", challengeId: "c1", participantId: "a", pointsCents: -2500, rank: null, reason: "ADJUSTMENT" }]);
  });
  it("a rank change with the same points still records the new rank", () => {
    const rs = rules({ points: { byRank: [10, 10, 5], beyond: 1, participation: 1, absent: 0 } });
    const mk = (va: number, vb: number) => ({ ...base, metric, rules: rs, eligibleParticipantIds: ["a", "b"], attempts: [A({ id: "1", participantId: "a", value: va }), A({ id: "2", participantId: "b", value: vb })] });
    const l1 = apply([], reconcileChallenge([], scoreChallenge(mk(30, 20)), "c1", "s"));
    const delta = reconcileChallenge(l1, scoreChallenge(mk(10, 20)), "c1", "s");
    expect(delta.map((x) => [x.participantId, x.pointsCents, x.rank])).toEqual([["a", 0, 2], ["b", 0, 1]]);
  });
  it("uses the provisional schedule only as a default", () => expect(PROVISIONAL_POINTS_SCHEDULE.byRank[0]).toBeGreaterThan(PROVISIONAL_POINTS_SCHEDULE.byRank[1] as number));
});
