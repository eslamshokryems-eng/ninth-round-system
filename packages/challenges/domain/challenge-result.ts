export type ChallengeResultStatus = "pending" | "approved" | "rejected" | "correction_pending";

/**
 * One official result per (challengeId, participantProfileId) at any moment — enforced
 * at the database level by a partial unique index (see the Phase 1
 * migration), not here. `correctsResultId` / `supersededByResultId` model
 * the correction chain: a correction is always a NEW row (correctsResultId
 * points at what it's proposing to replace); the ORIGINAL row's own status
 * never changes when a correction is merely proposed — only once a
 * correction is approved does the original get `supersededByResultId` set,
 * pointing at its replacement. The original's history (who approved what,
 * when) is never edited or deleted, only superseded.
 */
export interface ChallengeResult {
  resultId: string;
  challengeId: string;
  participantProfileId: string;
  enteredByProfileId: string;
  resultValue: number;
  normalizedResultValue: number | null;
  measurementUnit: string;
  performedAt: string;
  status: ChallengeResultStatus;
  /** Set only on a row proposing a correction — points at the result it would replace. Immutable after creation. */
  correctsResultId: string | null;
  /** Set only once a correction targeting this row has been approved — points at its replacement. Null while this row is still current. */
  supersededByResultId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The one result that currently counts toward rankings/points for its (challenge, participant) pair — matches the database's own partial-unique-index condition exactly, so this must never diverge from the SQL definition. */
export function isCurrentChallengeResult(result: ChallengeResult): boolean {
  return result.status === "approved" && result.supersededByResultId === null;
}
