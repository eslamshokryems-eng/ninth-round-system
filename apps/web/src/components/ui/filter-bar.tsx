import type { ReactNode } from "react";
import { Card } from "./card";

export interface FilterBarProps {
  children: ReactNode;
  hasActiveFilters?: boolean;
  onClear?: () => void;
}

/**
 * Compact, consistent filter row (2026-09 UX redesign) — sits directly
 * above a DataTable. Each filter control is passed as a child (TextField/
 * SelectField), laid out in a wrapping flex row so it degrades gracefully
 * on tablet/mobile without a separate responsive filter component.
 */
export function FilterBar({ children, hasActiveFilters, onClear }: FilterBarProps) {
  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-end gap-3">
        {children}
        {hasActiveFilters && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="mb-0.5 text-xs font-medium text-muted hover:text-ink"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </Card>
  );
}
