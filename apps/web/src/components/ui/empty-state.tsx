import type { ReactNode } from "react";
import { Button } from "./button";

export interface EmptyStateProps {
  message: string;
  variant?: "empty" | "error";
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
  icon?: ReactNode;
}

/**
 * One consistent "nothing to show" surface (2026-09 UX redesign) for both
 * true-empty ("No members found") and load-failure ("Unable to load sales
 * data") cases — same layout, only the message/color/action differ. Replaces
 * the mix of bare `<p className="text-muted">`/`<p className="text-red-400">`
 * strings scattered per page. Every error case gets a real recovery action
 * when the caller passes one, rather than dead-ending on static text.
 */
export function EmptyState({ message, variant = "empty", actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-white/5 bg-surface px-6 py-10 text-center">
      {icon ? <div className={variant === "error" ? "text-danger" : "text-muted"}>{icon}</div> : null}
      <p className={variant === "error" ? "text-sm text-danger" : "text-sm text-muted"}>{message}</p>
      {actionLabel && onAction ? (
        <Button variant="secondary" onClick={onAction} className="px-4 py-2 text-xs">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
