export type ChallengeParticipantStatus = "approved" | "rejected";

/**
 * Participation is auto-decided server-side at request time (spec §2.7) —
 * there is no "pending" status requiring manual approval. `eligibilityResult`
 * / `eligibilityReason` are stored at creation for auditability, per the
 * spec's explicit requirement, and are never recomputed or overwritten
 * afterward even if the member's underlying membership later changes.
 */
export interface ChallengeParticipant {
  participantId: string;
  challengeId: string;
  memberId: string;
  status: ChallengeParticipantStatus;
  eligibilityResult: boolean;
  eligibilityReason: string | null;
  requestedAt: string;
  createdAt: string;
}
