import type { Result } from "@9thround/shared-kernel";
import type { ChallengeParticipant } from "./challenge-participant";
import type { ChallengeParticipantRow } from "./challenge-queries";

export interface ChallengeParticipantRepository {
  /**
   * The caller's own identity is resolved server-side inside the
   * request_challenge_participation() RPC directly from auth.uid() — never
   * trusted as a client-supplied id, and never resolved through any
   * membership record. `branchId` is the participant's own choice: omit
   * (null) for a GLOBAL competition, or pass the chosen branch for a
   * BRANCH/MULTI_BRANCH one — validated structurally server-side against
   * the challenge's own scope/branch list, never requiring manager
   * approval. Eligibility (age-only) is evaluated and the decision stored
   * in the same transaction.
   */
  requestParticipation(challengeId: string, branchId: string | null): Promise<Result<ChallengeParticipant>>;
  /**
   * Branch Manager/Super Admin only — the only way a participant ever gets
   * an assigned coach (there is no automatic resolution to fall back to).
   * `reason` is required (no designation, first or changed, may be
   * silent) and is persisted via log_audit_event(), never dropped on the
   * floor.
   */
  designateCoach(participantId: string, coachId: string, reason: string): Promise<Result<void>>;
  /**
   * Participants of one competition. RLS answers this differently per
   * caller: in-scope staff get the whole roster, a customer gets only
   * their own row, and another customer gets nothing — the raw row
   * carries eligibility_reason and designated_coach_id, which is why it
   * is never served to anyone else.
   */
  listForChallenge(challengeId: string): Promise<Result<ChallengeParticipantRow[]>>;
  /** The caller's own participation across every competition — backs the member's "my challenges" view. */
  listOwn(): Promise<Result<ChallengeParticipantRow[]>>;
}
