"use client";

import type { SelectHTMLAttributes } from "react";

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
}

export function SelectField({ label, className = "", id, children, ...rest }: SelectFieldProps) {
  const fieldId = id ?? label.replace(/\s+/g, "-").toLowerCase();
  return (
    <label htmlFor={fieldId} className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <select
        id={fieldId}
        className={`w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-ink focus:border-gold focus:outline-none disabled:opacity-50 ${className}`}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}
