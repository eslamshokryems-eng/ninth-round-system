import { describe, expect, it } from "vitest";
import cases from "./parity-cases.json";
import { scoreChallenge } from "./scoring";
import type { Attempt, CountingPolicy, Metric, SeasonRules } from "./types";

/**
 * The SAME file is loaded by the SQL harness (tests/harness/league/33_league_parity.sql), which closes a challenge with these inputs through
 * race_league_set_challenge_status() and compares the ledger with `expect`. TypeScript and SQL must agree on every case.
 */
interface Case {
  name: string;
  metric: Metric;
  counting: CountingPolicy;
  rules: { points: SeasonRules["points"]; tiePolicy: SeasonRules["tiePolicy"]; absencePolicy: SeasonRules["absencePolicy"]; eligibility: SeasonRules["eligibility"] };
  participants: { id: string; active: boolean; eligible: boolean }[];
  attempts: { p: string; value: number; no: number; status: Attempt["status"]; at: string }[];
  expect: { p: string; cents: number; rank: number | null }[];
}

describe("TS side of the TS/SQL scoring parity cases", () => {
  for (const c of (cases as { cases: Case[] }).cases) {
    it(c.name, () => {
      const out = scoreChallenge({
        seasonId: "s",
        challengeId: "c",
        metric: c.metric,
        counting: c.counting,
        rules: c.rules,
        eligibleParticipantIds: c.participants.filter((p) => p.active && p.eligible).map((p) => p.id),
        attempts: c.attempts.map((a, i) => ({
          id: `a${i}`, seasonId: "s", challengeId: "c", participantId: a.p, value: a.value, unit: c.metric.unit, attemptNo: a.no, attemptedAt: a.at, recordedBy: "j", reviewedBy: "r",
          status: a.status, reason: null, correctedFrom: null, clientRequestId: `r${i}`,
        })),
      });
      const got = out.map((e) => ({ p: e.participantId, cents: e.pointsCents, rank: e.rank })).sort((x, y) => (x.p < y.p ? -1 : 1));
      const want = [...c.expect].sort((x, y) => (x.p < y.p ? -1 : 1));
      expect(got).toEqual(want);
    });
  }
  it("covers every counting policy, both tie policies and both absence policies", () => {
    const cs = (cases as { cases: Case[] }).cases;
    expect(new Set(cs.map((c) => c.counting))).toEqual(new Set(["BEST", "LATEST", "FIRST_APPROVED"]));
    expect(new Set(cs.map((c) => c.rules.tiePolicy))).toEqual(new Set(["SHARE", "SPLIT"]));
    expect(new Set(cs.map((c) => c.rules.absencePolicy))).toEqual(new Set(["ZERO", "PARTICIPATION"]));
    expect(new Set(cs.map((c) => c.metric.kind))).toEqual(new Set(["TIME", "REPS", "DISTANCE", "LOAD", "NUMERIC"]));
  });
});
