import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";

/**
 * Per the approved MVP simplification, coach assignment is EXCLUSIVELY
 * manager/super-admin designation (`challenge_participants.designated
 * CoachId`) — there is no automatic resolution through gym memberships
 * any more (no `memberships.coach_id`, no program-type matching). A
 * participant with no designated coach yet simply blocks submission with
 * a clear, actionable message; there is no fallback to compute.
 *
 * `validateCoachDesignationReason` is unchanged: a designation (first
 * assignment or a later change) still always requires a stated reason,
 * persisted via log_audit_event() — never dropped on the floor.
 */
export function validateCoachDesignationReason(reason: string): Result<void> {
  if (!reason || reason.trim().length === 0) {
    return err(
      domainError(
        "COACH_DESIGNATION_REASON_REQUIRED",
        "A reason is required to designate or change a participant's assigned coach.",
      ),
    );
  }
  return ok(undefined);
}

/**
 * The one check a database constraint alone can't easily express across
 * two different ids on two different rows (the participant's designated
 * coach vs. the caller) — enforced here AND re-checked inside
 * submit_challenge_result()/request_challenge_result_correction() (the
 * real gate), never trusted from the client alone.
 */
export function validateIsDesignatedCoach(designatedCoachId: string | null, callerProfileId: string): Result<void> {
  if (designatedCoachId === null) {
    return err(
      domainError(
        "NO_COACH_DESIGNATED",
        "No coach has been designated for this participant yet. Ask a branch manager or super admin to designate one.",
      ),
    );
  }
  if (designatedCoachId !== callerProfileId) {
    return err(domainError("NOT_DESIGNATED_COACH", "Only this participant's designated coach may do this."));
  }
  return ok(undefined);
}
