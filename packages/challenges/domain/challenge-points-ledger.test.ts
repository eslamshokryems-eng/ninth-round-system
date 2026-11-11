import { describe, expect, it } from "vitest";
import { aggregatePointsByParticipant, sumLedgerPoints, type ChallengePointsLedgerEntry } from "./challenge-points-ledger";

function entry(overrides: Partial<ChallengePointsLedgerEntry>): ChallengePointsLedgerEntry {
  return {
    entryId: "entry-1",
    seasonId: "season-1",
    challengeId: "challenge-1",
    participantProfileId: "profile-1",
    resultId: "result-1",
    pointsDelta: 0,
    reason: "challenge result approved",
    createdAt: "2026-01-01T00:00:00.000Z",
    createdBy: "coach-1",
    ...overrides,
  };
}

describe("sumLedgerPoints", () => {
  it("sums a participant's points across every ledger row", () => {
    expect(sumLedgerPoints([entry({ pointsDelta: 100 }), entry({ pointsDelta: 40 })])).toBe(140);
  });

  it("correctly nets a correction's compensating entry against the original award", () => {
    // Original approval (+90), then a correction: reversal (-90) + re-award at the corrected rank (+100).
    const entries = [entry({ pointsDelta: 90 }), entry({ pointsDelta: -90 }), entry({ pointsDelta: 100 })];
    expect(sumLedgerPoints(entries)).toBe(100);
  });

  it("returns 0 for an empty ledger", () => {
    expect(sumLedgerPoints([])).toBe(0);
  });
});

describe("aggregatePointsByParticipant", () => {
  it("groups and sums points per participant", () => {
    const totals = aggregatePointsByParticipant([
      entry({ participantProfileId: "profile-1", pointsDelta: 100 }),
      entry({ participantProfileId: "profile-2", pointsDelta: 90 }),
      entry({ participantProfileId: "profile-1", pointsDelta: 40 }),
    ]);
    expect(totals.get("profile-1")).toBe(140);
    expect(totals.get("profile-2")).toBe(90);
  });
});
