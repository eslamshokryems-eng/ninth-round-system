"use client";

import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const FIELD_CLASS =
  "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-ink placeholder:text-muted focus:border-gold focus:outline-none disabled:opacity-50";

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, className = "", id, ...rest },
  ref,
) {
  const fieldId = id ?? label.replace(/\s+/g, "-").toLowerCase();
  return (
    <label htmlFor={fieldId} className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <input ref={ref} id={fieldId} className={`${FIELD_CLASS} ${className}`} {...rest} />
    </label>
  );
});

export interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export function TextAreaField({ label, className = "", id, ...rest }: TextAreaFieldProps) {
  const fieldId = id ?? label.replace(/\s+/g, "-").toLowerCase();
  return (
    <label htmlFor={fieldId} className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <textarea id={fieldId} className={`${FIELD_CLASS} min-h-[80px] ${className}`} {...rest} />
    </label>
  );
}
