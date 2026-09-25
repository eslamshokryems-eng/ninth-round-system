export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "brand";

export interface StatusBadgeProps {
  label: string;
  tone: StatusTone;
}

const TONE_CLASS: Record<StatusTone, string> = {
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
  neutral: "bg-white/[0.06] text-muted",
  brand: "bg-brand/10 text-brand",
};

/**
 * The one place status color meaning is decided (2026-09 UX redesign) —
 * every "Active/Expiring/Expired/Paid/Pending/Cancelled/…" label in the app
 * should route through this component instead of each page picking its own
 * Tailwind color, so the same word always reads the same color everywhere.
 * Text label always accompanies the color (never color-only), per
 * accessibility requirements.
 */
export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Maps this app's existing membership-status vocabulary
 * (src/lib/membership-status.ts's DerivedMembershipStatus.text) to a tone —
 * kept here rather than inside membership-status.ts so that module stays
 * pure domain-status logic with no UI/color concern, matching the existing
 * separation in this codebase (domain layers don't know about Tailwind).
 */
export function membershipStatusTone(text: "No membership" | "Expired" | "Expiring Soon" | "Active"): StatusTone {
  switch (text) {
    case "Active":
      return "success";
    case "Expiring Soon":
      return "warning";
    case "Expired":
      return "danger";
    case "No membership":
      return "neutral";
  }
}
