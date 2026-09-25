import type { MembershipStatus } from "@9thround/reception";

export interface DerivedMembershipStatus {
  text: "No membership" | "Expired" | "Expiring Soon" | "Active";
  className: string;
}

/**
 * Single source of truth for the "Active / Expiring Soon / Expired" badge —
 * extracted verbatim from the Members page (apps/web/app/(reception)/members/page.tsx)
 * so Trainers reuses the exact same, already-in-production logic rather than
 * a second copy. Matches the Dashboard/Expiring page's own 7-day "expiring
 * soon" window (supabase-expiring-membership-repository.ts).
 */
export function deriveMembershipStatus(
  status: MembershipStatus | null,
  endDate: string | null,
): DerivedMembershipStatus {
  if (status === null) return { text: "No membership", className: "text-muted" };
  if (status === "expired" || status === "cancelled") return { text: "Expired", className: "text-red-400" };
  if (endDate) {
    const daysLeft = Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    // A negative daysLeft means end_date has already passed. This has to be
    // checked before the "expiring soon" window below — otherwise an
    // already-expired membership (e.g. status still "active" because
    // generate_membership_alerts() hasn't flipped it) satisfies
    // `daysLeft <= 7` too and gets mislabeled "Expiring Soon" instead of
    // "Expired", which is exactly the bug that made the Members page's
    // "Expired" filter never match anything.
    if (daysLeft < 0) return { text: "Expired", className: "text-red-400" };
    if (daysLeft <= 7) return { text: "Expiring Soon", className: "text-red-400" };
  }
  return { text: "Active", className: "text-gold" };
}
