import type { ReactNode } from "react";

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

/** Consistent Card-section title row (2026-09 UX redesign) — same shape as PageHeader but sized for inside a Card rather than the top of a page. */
export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex-shrink-0">{action}</div> : null}
    </div>
  );
}
