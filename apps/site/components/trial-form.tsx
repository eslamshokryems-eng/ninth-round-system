"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { track, events } from "@/lib/analytics";
import { TRIAL_PROGRAM_OPTIONS } from "@/content/programs";
import { WHATSAPP_MESSAGES } from "@/components/contact-links";

const TIMES = ["Morning", "Afternoon", "Evening"];

const field =
  "w-full rounded-lg border border-white/15 bg-ink-900 px-4 py-3 text-base text-bone placeholder:text-ash/60 focus:border-blood-bright focus:outline-none";
const label = "block text-sm font-medium text-bone";

export function TrialForm({ defaultProgram = "" }: { defaultProgram?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "unavailable">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const wa = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrors({});
    track(events.bookTrial, { source: "form" });

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, consent: data.consent === "on" }),
      });
      const json = (await res.json()) as { ok: boolean; errors?: Record<string, string>; reason?: string };

      if (res.ok && json.ok) {
        track(events.leadCreated, { source: "website_form" });
        router.push("/thank-you");
        return;
      }
      if (res.status === 422 && json.errors) {
        setErrors(json.errors);
        setStatus("error");
        return;
      }
      if (res.status === 503) {
        setStatus("unavailable");
        return;
      }
      setStatus("error");
      setErrors({ form: "Something went wrong. Please try again, or message us on WhatsApp." });
    } catch {
      setStatus("error");
      setErrors({ form: "Network problem. Please try again, or message us on WhatsApp." });
    }
  }

  return (
    <form
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      noValidate
      className="space-y-5"
    >
      {/* Honeypot — visually hidden, not announced, must stay empty. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-px w-px overflow-hidden">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label className={label} htmlFor="fullName">
          Full name <span className="text-blood-bright">*</span>
        </label>
        <input id="fullName" name="fullName" required autoComplete="name" className={`mt-1.5 ${field}`} />
        {errors.fullName ? <p className="mt-1 text-sm text-blood-bright">{errors.fullName}</p> : null}
      </div>

      <div>
        <label className={label} htmlFor="phone">
          Phone <span className="text-blood-bright">*</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="01x xxx xxxx"
          className={`mt-1.5 ${field}`}
        />
        {errors.phone ? <p className="mt-1 text-sm text-blood-bright">{errors.phone}</p> : null}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="program">
            Preferred program
          </label>
          <select id="program" name="program" defaultValue={defaultProgram} className={`mt-1.5 ${field}`}>
            <option value="">No preference</option>
            {TRIAL_PROGRAM_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="gender">
            Gender (optional)
          </label>
          <select id="gender" name="gender" className={`mt-1.5 ${field}`}>
            <option value="">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="preferredDate">
            Preferred date
          </label>
          <input id="preferredDate" name="preferredDate" type="date" className={`mt-1.5 ${field}`} />
        </div>
        <div>
          <label className={label} htmlFor="preferredTime">
            Preferred time
          </label>
          <select id="preferredTime" name="preferredTime" className={`mt-1.5 ${field}`}>
            <option value="">No preference</option>
            {TIMES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={label} htmlFor="email">
          Email (optional)
        </label>
        <input id="email" name="email" type="email" autoComplete="email" className={`mt-1.5 ${field}`} />
        {errors.email ? <p className="mt-1 text-sm text-blood-bright">{errors.email}</p> : null}
      </div>

      <div>
        <label className={label} htmlFor="notes">
          Anything we should know?
        </label>
        <textarea id="notes" name="notes" rows={3} className={`mt-1.5 ${field}`} />
      </div>

      <label className="flex items-start gap-3 text-sm text-ash">
        <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 accent-blood" />
        <span>
          I agree that 9th Round may contact me about my trial. See our{" "}
          <a href="/privacy" className="text-blood-bright underline">
            privacy note
          </a>
          .
        </span>
      </label>
      {errors.consent ? <p className="text-sm text-blood-bright">{errors.consent}</p> : null}

      {errors.form ? (
        <p className="rounded-lg border border-blood/40 bg-blood/10 px-4 py-3 text-sm text-bone">{errors.form}</p>
      ) : null}

      {status === "unavailable" ? (
        <p className="rounded-lg border border-white/15 bg-ink-900 px-4 py-3 text-sm text-ash">
          Online booking isn&apos;t available right now.{" "}
          {wa ? (
            <a
              className="text-blood-bright underline"
              href={`https://wa.me/${wa}?text=${encodeURIComponent(WHATSAPP_MESSAGES.trial)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Message us on WhatsApp
            </a>
          ) : (
            <a className="text-blood-bright underline" href="/contact">
              Contact us
            </a>
          )}{" "}
          and we&apos;ll set it up.
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : "Book my trial"}
      </Button>
    </form>
  );
}
