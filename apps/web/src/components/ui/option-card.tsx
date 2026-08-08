"use client";

export interface OptionCardProps {
  label: string;
  description?: string;
  isSelected: boolean;
  onClick: () => void;
}

/** Web equivalent of packages/ui/native/option-card.tsx's selectable-card pattern (radio group rendered as cards). */
export function OptionCard({ label, description, isSelected, onClick }: OptionCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-card border px-4 py-3 text-left transition-colors ${
        isSelected ? "border-gold bg-gold/10" : "border-white/10 bg-surface hover:border-white/20"
      }`}
    >
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {description ? <span className="block text-xs text-muted">{description}</span> : null}
      </span>
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-pill text-xs font-bold ${
          isSelected ? "bg-gold text-bg" : "bg-transparent"
        }`}
      >
        {isSelected ? "✓" : ""}
      </span>
    </button>
  );
}
