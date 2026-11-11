import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";

// Deliberately a local literal union, not an import from @9thround/reception's
// ProgramType — domains in this monorepo don't cross-import each other's
// types (confirmed: @9thround/sales keeps `interestedMembershipTypeId` as a
// plain string rather than importing reception's MembershipType). The 4
// values mirror the `program_type` Postgres enum exactly.
export type ChallengeProgramType = "ninth_round" | "boxing" | "kickboxing" | "mma";

export type ChallengeCategory = "strength" | "endurance" | "boxing" | "kickboxing" | "mma" | "ninth_round" | "hybrid_fitness";
export type ChallengeScope = "BRANCH" | "GLOBAL" | "MULTI_BRANCH";
export type ChallengeMeasurementType = "NUMERIC" | "TIME" | "COUNT";
export type ChallengeScoringDirection = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
export type ChallengeStatus = "draft" | "published" | "registration_open" | "active" | "completed" | "archived";

export interface Challenge {
  challengeId: string;
  seasonId: string;
  title: string;
  description: string | null;
  category: ChallengeCategory;
  programType: ChallengeProgramType | null;
  scope: ChallengeScope;
  /** Required when scope is "BRANCH"; must be null for "GLOBAL"/"MULTI_BRANCH" — see validateChallengeScope. A MULTI_BRANCH competition's eligible branches live in challenge_branches, never here. */
  branchId: string | null;
  measurementType: ChallengeMeasurementType;
  measurementUnit: string;
  scoringDirection: ChallengeScoringDirection;
  /** Integer 1-10 by default, validated at creation against challenge_settings' configured range — see validateChallengeWeight. */
  weight: number;
  registrationStartAt: string;
  registrationEndAt: string;
  startsAt: string;
  endsAt: string;
  status: ChallengeStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Weight validation — spec §2.3. Never trust a client-supplied value; this
// is the same check the create_challenge() RPC (Phase 2) runs server-side.
// ---------------------------------------------------------------------------

export const DEFAULT_CHALLENGE_WEIGHT = 1;
export const DEFAULT_MIN_CHALLENGE_WEIGHT = 1;
export const DEFAULT_MAX_CHALLENGE_WEIGHT = 10;

export function validateChallengeWeight(
  weight: number,
  min: number = DEFAULT_MIN_CHALLENGE_WEIGHT,
  max: number = DEFAULT_MAX_CHALLENGE_WEIGHT,
): Result<number> {
  if (!Number.isInteger(weight)) {
    return err(domainError("INVALID_WEIGHT", "Competition weight must be a whole number."));
  }
  if (weight < min || weight > max) {
    return err(domainError("WEIGHT_OUT_OF_RANGE", `Competition weight must be between ${min} and ${max}.`));
  }
  return ok(weight);
}

// ---------------------------------------------------------------------------
// Scope/branch consistency — three scopes, per the approved revised
// architecture: GLOBAL (one overall leaderboard, no branch at all), BRANCH
// (exactly one branch, on the challenge itself), MULTI_BRANCH (no single
// branch on the challenge — its eligible branches are a separate list,
// `branchIds`, so the schema never needs redesigning as more branches are
// added later).
// ---------------------------------------------------------------------------

export function validateChallengeScope(
  scope: ChallengeScope,
  branchId: string | null,
  branchIds: string[] | null = null,
): Result<void> {
  if (scope === "GLOBAL") {
    if (branchId !== null) {
      return err(domainError("INVALID_SCOPE", "A global competition cannot be scoped to a single branch."));
    }
    if (branchIds !== null && branchIds.length > 0) {
      return err(domainError("INVALID_SCOPE", "A global competition has no branch list — it is open globally."));
    }
    return ok(undefined);
  }

  if (scope === "BRANCH") {
    if (branchId === null) {
      return err(domainError("INVALID_SCOPE", "A branch competition must specify its branch."));
    }
    return ok(undefined);
  }

  // MULTI_BRANCH
  if (branchId !== null) {
    return err(domainError("INVALID_SCOPE", "A multi-branch competition has no single branch — use the branch list instead."));
  }
  if (branchIds === null || branchIds.length < 1) {
    return err(domainError("INVALID_SCOPE", "A multi-branch competition must list at least one eligible branch."));
  }
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Lifecycle — spec §3: Draft -> Published -> Registration Open -> Active ->
// Completed -> Archived. Strictly sequential, one step at a time; never a
// skip and never backward.
// ---------------------------------------------------------------------------

const CHALLENGE_STATUS_ORDER: ChallengeStatus[] = ["draft", "published", "registration_open", "active", "completed", "archived"];

export function canTransitionChallengeStatus(from: ChallengeStatus, to: ChallengeStatus): boolean {
  const fromIndex = CHALLENGE_STATUS_ORDER.indexOf(from);
  const toIndex = CHALLENGE_STATUS_ORDER.indexOf(to);
  return fromIndex !== -1 && toIndex === fromIndex + 1;
}

// ---------------------------------------------------------------------------
// Scoring engine — spec §8. Deterministic, direction-aware, never assumes
// higher-is-better. Pure functions only: no Supabase, no React, no I/O —
// the same values must be reproducible from the approved results alone at
// any time (spec §6/§8's auditability/reproducibility requirement).
// ---------------------------------------------------------------------------

export interface RankPointsPolicy {
  /** Index 0 = rank 1's points, index 1 = rank 2's, etc. */
  byRank: number[];
  /** Points for any rank beyond byRank.length. */
  beyond: number;
}

/**
 * Approved rank-points table (9TH ROUND CHALLENGES spec §2.3/§8, confirmed
 * by the user): 1st-9th place 100/90/80/75/70/65/60/55/50, every other
 * approved result 40. The actual policy used at scoring time is read from
 * challenge_settings (Phase 2) — this constant is the seeded default, not
 * a hardcoded assumption baked into the engine itself.
 */
export const DEFAULT_RANK_POINTS_POLICY: RankPointsPolicy = {
  byRank: [100, 90, 80, 75, 70, 65, 60, 55, 50],
  beyond: 40,
};

export function basePointsForRank(rank: number, policy: RankPointsPolicy = DEFAULT_RANK_POINTS_POLICY): number {
  if (!Number.isInteger(rank) || rank < 1) {
    throw new Error("rank must be a positive integer");
  }
  const index = rank - 1;
  return policy.byRank[index] ?? policy.beyond;
}

export function calculateEarnedPoints(rank: number, weight: number, policy: RankPointsPolicy = DEFAULT_RANK_POINTS_POLICY): number {
  return basePointsForRank(rank, policy) * weight;
}

export interface ScoredEntry {
  id: string;
  value: number;
}

export interface RankedEntry extends ScoredEntry {
  rank: number;
  points: number;
}

/**
 * Competition ranking (1, 2, 2, 4): equal values share a rank and its
 * points; the next distinct value's rank is its position in the sorted
 * list, not the previous rank + 1 — exactly standard competition ranking.
 * `direction` decides sort order: LOWER_IS_BETTER sorts ascending (a 1000m
 * row time), HIGHER_IS_BETTER sorts descending (a push-up count) — the
 * caller must always say which; there is no default.
 */
export function rankResults(
  entries: ScoredEntry[],
  direction: ChallengeScoringDirection,
  weight: number,
  policy: RankPointsPolicy = DEFAULT_RANK_POINTS_POLICY,
): RankedEntry[] {
  const sorted = [...entries].sort((a, b) => (direction === "LOWER_IS_BETTER" ? a.value - b.value : b.value - a.value));

  const ranked: RankedEntry[] = [];
  let previousValue: number | null = null;
  let previousRank = 0;

  sorted.forEach((entry, index) => {
    const rank = previousValue !== null && entry.value === previousValue ? previousRank : index + 1;
    ranked.push({ ...entry, rank, points: calculateEarnedPoints(rank, weight, policy) });
    previousValue = entry.value;
    previousRank = rank;
  });

  return ranked;
}
