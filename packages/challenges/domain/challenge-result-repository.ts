import type { Result } from "@9thround/shared-kernel";
import type { ChallengeResultRow, ChallengeResultReviewRow } from "./challenge-queries";

export interface SubmitChallengeResultInput {
  challengeId: string;
  participantProfileId: string;
  resultValue: number;
  measurementUnit: string;
  performedAt: string;
}

export interface RequestChallengeResultCorrectionInput {
  /** The result being proposed for correction — must currently be the live/current one (enforced server-side; see this domain's challenge-result.ts doc comment). */
  correctsResultId: string;
  resultValue: number;
  measurementUnit: string;
  performedAt: string;
}

export interface ReviewChallengeResultInput {
  resultId: string;
  notes: string | null;
}

export interface ChallengeResultRepository {
  /** Coach-only — submit_challenge_result() checks server-side that the caller is this participant's designated_coach_id and rejects otherwise. No automatic resolution exists to fall back to. */
  submit(input: SubmitChallengeResultInput): Promise<Result<{ resultId: string }>>;
  approve(input: ReviewChallengeResultInput): Promise<Result<void>>;
  /** notes is required for a rejection — validated client-side by validateReviewDecision() before this is ever called, and re-checked server-side. */
  reject(input: ReviewChallengeResultInput): Promise<Result<void>>;
  requestCorrection(input: RequestChallengeResultCorrectionInput): Promise<Result<{ resultId: string }>>;
  /** Recomputes the whole challenge's ranking and writes compensating + new ledger entries for every affected participant, atomically — see approve_challenge_result_correction(). */
  approveCorrection(input: ReviewChallengeResultInput): Promise<Result<void>>;
  rejectCorrection(input: ReviewChallengeResultInput): Promise<Result<void>>;
  /**
   * Results of one competition, for the review desk. RLS decides the
   * scope: in-scope staff see every status (pending, approved, rejected,
   * correction_pending), a customer sees their own plus everyone's
   * current approved ones.
   */
  listForChallenge(challengeId: string): Promise<Result<ChallengeResultRow[]>>;
  /**
   * Every review decision on this competition's results, oldest first. A plain
   * select: the row-level policies decide what comes back (staff in scope, and
   * a participant's own), so a member never sees another athlete's reviews.
   */
  listReviewsForChallenge(challengeId: string): Promise<Result<ChallengeResultReviewRow[]>>;
  /** The caller's own results across every competition — the member's submission history and status tracker. */
  listOwn(): Promise<Result<ChallengeResultRow[]>>;
}
