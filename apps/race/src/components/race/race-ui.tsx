"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/** THE NINTH wordmark + 9th Round byline. Used as the top bar on every /race page. */
export function RaceHeader({ right, wide = false }: { right?: ReactNode; wide?: boolean }) {
  return (
    <header>
      <div className="race-stripe" />
      <div className={`mx-auto flex ${wide ? "max-w-6xl" : "max-w-2xl"} flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-4`}>
        <a href="/race" className="flex items-baseline gap-3" aria-label="THE NINTH — home">
          <span className="race-display text-3xl sm:text-4xl">
            THE <span style={{ color: "var(--race-red-hot)" }}>NINTH</span>
          </span>
          <span className="race-kicker hidden sm:inline">9th Round</span>
        </a>
        {right}
      </div>
    </header>
  );
}

export function RacePage({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto w-full ${wide ? "max-w-6xl" : "max-w-2xl"} px-4 pb-16 pt-6`}>{children}</main>
  );
}

export function RaceButton({
  variant = "primary",
  size = "md",
  isLoading,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger"; size?: "md" | "sm"; isLoading?: boolean }) {
  const cls = ["race-btn", variant === "ghost" ? "race-btn--ghost" : "", variant === "danger" ? "race-btn--danger" : "", size === "sm" ? "race-btn--sm" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} disabled={disabled ?? isLoading ?? false} {...rest}>
      {isLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

interface FieldShellProps {
  label: string;
  hint?: string | undefined;
  error?: string | null | undefined;
  children: ReactNode;
  htmlFor: string;
}

function FieldShell({ label, hint, error, children, htmlFor }: FieldShellProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="race-label">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs" style={{ color: "var(--race-muted)" }}>{hint}</p> : null}
      {error ? (
        <p role="alert" className="text-sm" style={{ color: "var(--race-red-hot)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function RaceInput({ label, hint, error, id, inputRef, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null; id: string; inputRef?: Ref<HTMLInputElement> }) {
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={id}>
      <input ref={inputRef} id={id} className="race-input" aria-invalid={error ? true : undefined} {...rest} />
    </FieldShell>
  );
}

export function RaceSelect({ label, hint, error, id, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string | null; id: string }) {
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={id}>
      <select id={id} className="race-input" aria-invalid={error ? true : undefined} {...rest}>
        {children}
      </select>
    </FieldShell>
  );
}

export function RaceTextArea({ label, hint, error, id, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string | null; id: string }) {
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={id}>
      <textarea id={id} className="race-input" style={{ minHeight: 88 }} aria-invalid={error ? true : undefined} {...rest} />
    </FieldShell>
  );
}

export function RaceBadge({ tone = "line", children }: { tone?: "line" | "red" | "white"; children: ReactNode }) {
  const cls = tone === "red" ? "race-badge race-badge--red" : tone === "white" ? "race-badge race-badge--white" : "race-badge";
  return <span className={cls}>{children}</span>;
}

export function RaceNotice({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="race-notice">
      {children}
    </div>
  );
}

export function RaceSpinner() {
  return (
    <div className="flex justify-center py-16" role="status" aria-label="Loading">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--race-red-hot)", borderTopColor: "transparent" }} />
    </div>
  );
}

/** Money as the organizers write it: 750 EGP (no cents when whole). */
export function formatMoney(amount: number, currency: string): string {
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${value} ${currency}`;
}

/** A moment shown in the EVENT's timezone (athletes may be browsing from anywhere). */
export function formatEventTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(new Date(iso));
}

export function formatEventDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y!, m! - 1, d!)));
}

/** Wall-clock time of day (HH:MM:SS) in the event's timezone — what desks and screens show for a slot. */
export function formatClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone }).format(new Date(iso));
}

/** Race time (milliseconds since START EVENT) as H:MM:SS. */
export function formatRaceTime(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Links between the staff screens (Registrations · Check-in). */
export function StaffNav({ slug, current }: { slug: string; current: "registrations" | "reception" | "control" | "results" | "evidence" }) {
  const item = (href: string, label: string, active: boolean) => (
    <a
      key={href}
      href={href}
      aria-current={active ? "page" : undefined}
      className="race-label"
      style={{ padding: "0.5rem 0.25rem", borderBottom: active ? "2px solid var(--race-red-hot)" : "2px solid transparent", color: active ? "var(--race-white)" : undefined }}
    >
      {label}
    </a>
  );
  return (
    <nav className="flex flex-wrap justify-end gap-x-5 gap-y-1" aria-label="Staff screens">
      {item(`/race/control/${slug}`, "Control", current === "control")}
      {item(`/race/control/${slug}/evidence`, "Evidence", current === "evidence")}
      {item(`/race/control/${slug}/results`, "Results", current === "results")}
      {item(`/race/reception/${slug}`, "Check-in", current === "reception")}
      {item(`/race/admin/${slug}/registrations`, "Registrations", current === "registrations")}
    </nav>
  );
}
