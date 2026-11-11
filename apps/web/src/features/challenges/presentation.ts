import type {
  ChallengeCategory,
  ChallengeListItem,
  ChallengeMeasurementType,
  ChallengeParticipantStatus,
  ChallengeResultStatus,
  ChallengeScope,
  ChallengeScoringDirection,
  ChallengeStatus,
} from "@9thround/challenges";
import type { StatusTone } from "../../components/ui/status-badge";

/**
 * Presentation-only helpers shared by the staff console and the member
 * screens. Nothing here decides permissions — the row-level policies and
 * the RPCs do that, and these functions never see a role.
 */

export const CHALLENGE_CATEGORIES: ChallengeCategory[] = [
  "strength",
  "endurance",
  "boxing",
  "kickboxing",
  "mma",
  "ninth_round",
  "hybrid_fitness",
];

export const CHALLENGE_MEASUREMENT_TYPES: ChallengeMeasurementType[] = ["COUNT", "NUMERIC", "TIME"];
export const CHALLENGE_SCORING_DIRECTIONS: ChallengeScoringDirection[] = ["HIGHER_IS_BETTER", "LOWER_IS_BETTER"];
export const CHALLENGE_PROGRAM_TYPES = ["ninth_round", "boxing", "kickboxing", "mma"] as const;

/** Title-cases an enum value for display: `hybrid_fitness` -> `Hybrid Fitness`. */
export function humanize(value: string): string {
  return value
    .split(/[_\s]+/)
    .map((part) => (part.length === 0 ? part : part[0]!.toUpperCase() + part.slice(1).toLowerCase()))
    .join(" ");
}

export function challengeStatusTone(status: ChallengeStatus): StatusTone {
  switch (status) {
    case "active":
      return "success";
    case "registration_open":
      return "brand";
    case "published":
      return "info";
    case "completed":
      return "neutral";
    case "archived":
      return "neutral";
    case "draft":
    default:
      return "warning";
  }
}

export function resultStatusTone(status: ChallengeResultStatus): StatusTone {
  switch (status) {
    case "approved":
      return "success";
    case "rejected":
      return "danger";
    case "correction_pending":
      return "warning";
    case "pending":
    default:
      return "info";
  }
}

export function participantStatusTone(status: ChallengeParticipantStatus): StatusTone {
  return status === "approved" ? "success" : "danger";
}

export function scopeLabel(scope: ChallengeScope): string {
  switch (scope) {
    case "GLOBAL":
      return "All branches";
    case "MULTI_BRANCH":
      return "Selected branches";
    case "BRANCH":
    default:
      return "Single branch";
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** For `<input type="datetime-local">`, which needs `YYYY-MM-DDTHH:mm` in local time. */
export function toDateTimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Whether the registration window is open right now. Advisory only — the
 * authoritative check lives in request_challenge_participation(), which
 * re-tests the window and the status server-side; this just stops the UI
 * from offering a button that is certain to be refused.
 */
export function isRegistrationOpen(challenge: ChallengeListItem, now: Date = new Date()): boolean {
  if (challenge.status !== "registration_open") return false;
  return now >= new Date(challenge.registrationStartAt) && now <= new Date(challenge.registrationEndAt);
}

/** Only these two roles may create a competition — mirrors create_challenge()'s own guard. */
export function canCreateChallenges(role: string | null): boolean {
  return role === "branch_manager" || role === "super_admin";
}

/** The single status a competition may move to next, or null once it is archived. Mirrors canTransitionChallengeStatus() in the domain. */
export function nextChallengeStatus(status: ChallengeStatus): ChallengeStatus | null {
  switch (status) {
    case "draft": return "published";
    case "published": return "registration_open";
    case "registration_open": return "active";
    case "active": return "completed";
    case "completed": return "archived";
    default: return null;
  }
}

/** What the button for each move says — the verb the gym would use, not the enum. */
export function challengeStatusActionLabel(next: ChallengeStatus): string {
  switch (next) {
    case "published": return "Publish competition";
    case "registration_open": return "Open registration";
    case "active": return "Start competition";
    case "completed": return "Complete competition";
    case "archived": return "Archive competition";
    default: return `Move to ${humanize(next)}`;
  }
}

/** Moves that cannot be taken back and change what members see or score — these ask for a second click. */
export function challengeStatusNeedsConfirmation(next: ChallengeStatus): boolean {
  return next === "active" || next === "completed" || next === "archived";
}

/**
 * Who may move a competition along its lifecycle — mirrors
 * set_challenge_status(): a super admin for any competition, a branch
 * manager only for a BRANCH competition of their own branch. The server
 * re-checks all of it; this only hides a button that would certainly be
 * refused.
 */
export function canManageChallengeLifecycle(
  role: string | null,
  challenge: { scope: ChallengeScope; branchId: string | null },
  callerBranchId: string | null,
): boolean {
  if (role === "super_admin") return true;
  if (role === "branch_manager") {
    return challenge.scope === "BRANCH" && challenge.branchId !== null && challenge.branchId === callerBranchId;
  }
  return false;
}

/**
 * Who may approve or reject. Derived from the review RPCs after the H-2
 * fix: on a GLOBAL competition only a branch manager or super admin may
 * review; on BRANCH/MULTI_BRANCH an in-branch coach may too. The server
 * re-checks branch scope, which the browser cannot evaluate reliably, so
 * this only hides buttons that would certainly be refused.
 */
export function canReviewResults(role: string | null, scope: ChallengeScope): boolean {
  if (role === "branch_manager" || role === "super_admin") return true;
  if (role === "coach") return scope !== "GLOBAL";
  return false;
}

/** Only a branch manager or super admin may designate a participant's coach. */
export function canDesignateCoach(role: string | null): boolean {
  return role === "branch_manager" || role === "super_admin";
}
