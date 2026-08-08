"use client";

import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-gold text-bg hover:bg-gold-soft",
  secondary: "border border-gold text-gold bg-transparent hover:bg-gold/10",
  ghost: "text-gold bg-transparent hover:bg-white/[0.06]",
  danger: "border border-red-500 text-red-400 bg-transparent hover:bg-red-500/10",
};

/** The one solid-gold-fill variant ("primary") is reserved for the single primary action on a screen — matches packages/ui/native/button.tsx's "gold is earned" rule. */
export function Button({ variant = "primary", isLoading, disabled, className = "", children, ...rest }: ButtonProps) {
  const isDisabled = disabled ?? isLoading ?? false;
  return (
    <button
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 rounded-pill px-5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {isLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null}
      {children}
    </button>
  );
}
