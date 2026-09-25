export type StatCardTone = "default" | "warning" | "success" | "danger" | "info" | "brand";

export interface StatCardProps {
  label: string;
  value: string | number;
  tone?: StatCardTone;
  icon?: () => JSX.Element;
  hint?: string;
  /** e.g. "+12% vs last week" / "-3 vs yesterday" — only pass this when the caller already has the comparison value; this component never computes one itself. */
  deltaLabel?: string;
  deltaDirection?: "up" | "down";
}

const TONE_TEXT_CLASS: Record<StatCardTone, string> = {
  default: "text-gold",
  warning: "text-warning",
  success: "text-success",
  danger: "text-danger",
  info: "text-info",
  brand: "text-brand",
};

const TONE_ICON_CLASS: Record<StatCardTone, string> = {
  default: "bg-gold/10 text-gold",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  danger: "bg-danger/10 text-danger",
  info: "bg-info/10 text-info",
  brand: "bg-brand/10 text-brand",
};

/**
 * The app's one "metric card" component — this doubles as the redesign's
 * "MetricCard" requirement (2026-09 UX redesign extended this rather than
 * adding a duplicate component): now carries the full semantic tone set
 * (success/warning/danger/info/brand, plus the original default/warning)
 * and an optional delta/comparison indicator for pages that already compute
 * one. `tone="warning"` keeps its historical meaning (still maps to the
 * warning color) so every existing call site keeps working unchanged.
 */
export function StatCard({ label, value, tone = "default", icon: Icon, hint, deltaLabel, deltaDirection }: StatCardProps) {
  return (
    <div className="flex-1 rounded-card border border-white/5 bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
          <p className={`mt-2 text-3xl font-semibold ${TONE_TEXT_CLASS[tone]}`}>{value}</p>
          {deltaLabel ? (
            <p className={`mt-1 text-xs font-medium ${deltaDirection === "down" ? "text-danger" : "text-success"}`}>
              {deltaDirection === "down" ? "↓" : "↑"} {deltaLabel}
            </p>
          ) : hint ? (
            <p className="mt-1 text-xs text-muted">{hint}</p>
          ) : null}
        </div>
        {Icon ? (
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${TONE_ICON_CLASS[tone]}`}>
            <Icon />
          </div>
        ) : null}
      </div>
    </div>
  );
}
