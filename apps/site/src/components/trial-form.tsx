"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { PROGRAMS } from "../data/programs";
import { useLanguage } from "../i18n/language-provider";

/**
 * UX/structure only: this form does NOT call Supabase or any backend.
 * Submitting captures nothing beyond local component state and shows a
 * confirmation message — no lead is created, no production data is
 * touched. Wiring this to the CRM is a separate, explicitly-approved task.
 */
export function TrialForm() {
  const { dict, locale } = useLanguage();
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
      <div className="rounded-card border border-red/40 bg-red/10 p-6 text-center">
        <p className="text-lg font-bold text-bone">
          {fullName || (locale === "ar" ? "تمام" : "Got it")}!
        </p>
        <p className="mt-2 text-sm text-grey">
          {locale === "ar"
            ? "الفورم ده لسه مش متوصل بنظام الحجز مباشرة — كلمنا على الواتساب وهنأكد معاك."
            : "This form isn't wired to live booking yet — message us on WhatsApp and we'll confirm."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-card border border-bone/15 p-6">
      <Field label={dict.pages.trial.formName}>
        <input
          type="text"
          required
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          className="w-full rounded-lg border border-bone/20 bg-black px-3 py-2 text-sm text-bone outline-none focus:border-red"
        />
      </Field>

      <Field label={dict.pages.trial.formPhone}>
        <input
          type="tel"
          required
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="w-full rounded-lg border border-bone/20 bg-black px-3 py-2 text-sm text-bone outline-none focus:border-red"
        />
      </Field>

      <Field label={dict.pages.trial.formProgram}>
        <select
          value={program}
          onChange={(event) => setProgram(event.target.value)}
          className="w-full rounded-lg border border-bone/20 bg-black px-3 py-2 text-sm text-bone outline-none focus:border-red"
        >
          {PROGRAMS.map((item) => (
            <option key={item.slug} value={item.slug}>
              {item.name[locale]}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={dict.pages.trial.formDate}>
          <input
            type="date"
            value={preferredDate}
            onChange={(event) => setPreferredDate(event.target.value)}
            className="w-full rounded-lg border border-bone/20 bg-black px-3 py-2 text-sm text-bone outline-none focus:border-red"
          />
        </Field>
        <Field label={dict.pages.trial.formTime}>
          <input
            type="time"
            value={preferredTime}
            onChange={(event) => setPreferredTime(event.target.value)}
            className="w-full rounded-lg border border-bone/20 bg-black px-3 py-2 text-sm text-bone outline-none focus:border-red"
          />
        </Field>
      </div>

      <Field label={dict.pages.trial.formNotes}>
        <textarea
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          className="w-full rounded-lg border border-bone/20 bg-black px-3 py-2 text-sm text-bone outline-none focus:border-red"
        />
      </Field>

      <button
        type="submit"
        className="w-full rounded-pill bg-red px-6 py-3 text-sm font-bold uppercase tracking-wide text-bone transition-colors hover:bg-red/90"
      >
        {dict.pages.trial.formSubmit}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-grey">{label}</span>
      {children}
    </label>
  );
}
