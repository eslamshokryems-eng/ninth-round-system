"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { PROGRAMS } from "../data/programs";

/**
 * UX/structure only, per instruction: this form does NOT call Supabase or
 * any backend. Submitting captures nothing beyond local component state
 * and shows a confirmation message — no lead is created, no production
 * data is touched. Wiring this to the CRM (packages/sales' create-lead
 * flow, via a narrow anon-safe RPC) is a separate, explicitly-approved
 * task — see docs/08-deployment-plan.md / the Phase 7 audit notes.
 */
export function TrialForm() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [program, setProgram] = useState(PROGRAMS[0]?.slug ?? "");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitted(true);
  }

  if (isSubmitted) {
    return (
      <div className="rounded-card border border-gold/40 bg-gold/10 p-6 text-center">
        <p className="text-lg font-semibold text-ink">Thanks, {fullName || "there"} — form captured.</p>
        <p className="mt-2 text-sm text-muted">
          This trial-booking form isn&apos;t connected to the booking system yet. Once
          approved, submissions like this one will create a Lead in the Sales CRM.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-card border border-white/10 bg-surface p-6">
      <Field label="Full name">
        <input
          type="text"
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          className="w-full rounded-lg border border-white/10 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-gold"
        />
      </Field>

      <Field label="Phone">
        <input
          type="tel"
          required
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="w-full rounded-lg border border-white/10 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-gold"
        />
      </Field>

      <Field label="Preferred program">
        <select
          value={program}
          onChange={(event) => setProgram(event.target.value)}
          className="w-full rounded-lg border border-white/10 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-gold"
        >
          {PROGRAMS.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Preferred date">
          <input
            type="date"
            value={preferredDate}
            onChange={(event) => setPreferredDate(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-gold"
          />
        </Field>
        <Field label="Preferred time">
          <input
            type="time"
            value={preferredTime}
            onChange={(event) => setPreferredTime(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-gold"
          />
        </Field>
      </div>

      <Field label="Notes (optional)">
        <textarea
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="w-full rounded-lg border border-white/10 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-gold"
        />
      </Field>

      <button
        type="submit"
        className="w-full rounded-pill bg-gold px-6 py-3 text-sm font-bold text-bg transition-colors hover:bg-gold-soft"
      >
        Request My Free Trial
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
