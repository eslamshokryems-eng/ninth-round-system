export type ChallengeParticipantStatus = "approved" | "rejected";

/**
 * Participation is auto-decided server-side at request time — there is no
 * "pending" status requiring manual approval. `eligibilityResult` /
 * `eligibilityReason` are stored at creation for auditability and are
 * never recomputed or overwritten afterward.
 *
 * Identity is `participantProfileId` — `profiles.id`, resolved server-side
 * from `auth.uid()` directly. There is no membership record involved at
 * all: participation never requires an active membership, and this
 * identifier is never derived from one.
 *
 * `branchId` is the participant's OWN choice at registration time (never
 * derived from any membership or staff-assigned branch): null for a
 * GLOBAL competition (there is nothing to choose), the challenge's own
 * branch for a BRANCH competition, or one of that challenge's
 * `challenge_branches` for a MULTI_BRANCH competition. The same account
 * may choose a different eligible branch for a different competition —
 * this is competition-specific, unlike the account-level display name.
 */
export interface ChallengeParticipant {
  participantId: string;
  challengeId: string;
  participantProfileId: string;
  branchId: string | null;
  status: ChallengeParticipantStatus;
  eligibilityResult: boolean;
  eligibilityReason: string | null;
  designatedCoachId: string | null;
  requestedAt: string;
  createdAt: string;
}
