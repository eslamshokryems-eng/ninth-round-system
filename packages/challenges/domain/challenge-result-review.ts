import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";

export type ChallengeResultReviewDecision = "approved" | "rejected";

/** Append-only — a review is never edited or deleted once recorded, matching this codebase's established audit-trail convention (admin_audit_log, lead_followups, etc.). */
export interface ChallengeResultReview {
  reviewId: string;
  resultId: string;
  reviewerProfileId: string;
  decision: ChallengeResultReviewDecision;
  /** Required on rejection, same pattern as mark_lead_lost's required reason. */
  notes: string | null;
  createdAt: string;
}

/**
 * The one rule a database constraint alone can't easily express across two
 * different profile ids on two different rows (the result's author vs. the
 * reviewer) — enforced here AND re-checked inside the approve/reject RPC
 * (Phase 2), never trusted from the client alone (spec §6.1/§6.2/§7).
 */
export function validateReviewerIsNotAuthor(reviewerProfileId: string, authorProfileId: string): Result<void> {
  if (reviewerProfileId === authorProfileId) {
    return err(domainError("SELF_APPROVAL_NOT_ALLOWED", "You cannot approve or reject your own submitted result."));
  }
  return ok(undefined);
}

export function validateReviewDecision(decision: ChallengeResultReviewDecision, notes: string | null): Result<void> {
  if (decision === "rejected" && (!notes || notes.trim().length === 0)) {
    return err(domainError("REJECTION_REASON_REQUIRED", "A reason is required to reject a result."));
  }
  return ok(undefined);
}
