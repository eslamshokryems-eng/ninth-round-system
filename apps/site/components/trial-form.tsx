"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/button";
import { track, events } from "@/lib/analytics";
import { whatsappMessages } from "@/content/site.config";
import { href, type Lang } from "@/content/i18n/config";

const field =
  "w-full rounded-lg border border-white/15 bg-ink-900 px-4 py-3 text-base text-bone placeholder:text-ash/60 focus:border-blood-bright focus:outline-none";
const label = "block text-sm font-medium text-bone";

/**
 * Every label arrives as a prop rather than being read from a dictionary
 * here, so the client bundle carries one language's strings, not two.
 *
 * `campaign` is set only by an ad landing page; it rides along to the API
 * and lands in the lead note, which is how cost-per-lead becomes readable
 * per campaign instead of one undifferentiated "website" bucket.
 */
export interface TrialFormLabels {
  fullName: string;
  phone: string;
  phonePlaceholder: string;
  program: string;
  noPreference: string;
  gender: string;
  preferNotToSay: string;
  female: string;
  male: string;
  preferredDate: string;
  preferredTime: string;
  times: string[];
  email: string;
  notes: string;
  consentBefore: string;
  consentLink: string;
  company: string;
  genericError: string;
  networkError: string;
  unavailableBefore: string;
  unavailableAfter: string;
  submit: string;
  sending: string;
  whatsapp: string;
  contact: string;
}

export function TrialForm({
  lang,
  labels,
  programOptions,
  defaultProgram = "",
  campaign,
  compact = false,
}: {
  lang: Lang;
  labels: TrialFormLabels;
  programOptions: Array<{ value: string; label: string }>;
  defaultProgram?: string;
  campaign?: string;
  /** Landing-page variant: name, phone and consent only. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "unavailable">("idle");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const wa = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrors({});
    track(events.bookTrial, { source: campaign ? "landing" : "form", campaign: campaign ?? "none", lang });

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch("/api/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, consent: data.consent === "on", lang, campaign }),
      });
      const json = (await res.json()) as { ok: boolean; errors?: Record<string, string>; reason?: string };

      if (res.ok && json.ok) {
        track(events.leadCreated, { source: campaign ? `ad_${campaign}` : "website_form", lang });
        router.push(href(lang, "/thank-you"));
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
      setErrors({ form: labels.genericError });
    } catch {
      setStatus("error");
      setErrors({ form: labels.networkError });
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
      <div aria-hidden="true" className="absolute h-px w-px overflow-hidden" style={{ insetInlineStart: "-9999px" }}>
        <label htmlFor="company">{labels.company}</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label className={label} htmlFor="fullName">
          {labels.fullName} <span className="text-blood-bright">*</span>
        </label>
        <input id="fullName" name="fullName" required autoComplete="name" className={`mt-1.5 ${field}`} />
        {errors.fullName ? <p className="mt-1 text-sm text-blood-bright">{errors.fullName}</p> : null}
      </div>

      <div>
        <label className={label} htmlFor="phone">
          {labels.phone} <span className="text-blood-bright">*</span>
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          required
          dir="ltr"
          inputMode="tel"
          autoComplete="tel"
          placeholder={labels.phonePlaceholder}
          className={`mt-1.5 text-start ${field}`}
        />
        {errors.phone ? <p className="mt-1 text-sm text-blood-bright">{errors.phone}</p> : null}
      </div>

      {!compact ? (
        <>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="program">
                {labels.program}
              </label>
              <select id="program" name="program" defaultValue={defaultProgram} className={`mt-1.5 ${field}`}>
                <option value="">{labels.noPreference}</option>
                {programOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="gender">
                {labels.gender}
              </label>
              <select id="gender" name="gender" className={`mt-1.5 ${field}`}>
                <option value="">{labels.preferNotToSay}</option>
                <option value="female">{labels.female}</option>
                <option value="male">{labels.male}</option>
              </select>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="preferredDate">
                {labels.preferredDate}
              </label>
              <input id="preferredDate" name="preferredDate" type="date" className={`mt-1.5 ${field}`} />
            </div>
            <div>
              <label className={label} htmlFor="preferredTime">
                {labels.preferredTime}
              </label>
              <select id="preferredTime" name="preferredTime" className={`mt-1.5 ${field}`}>
                <option value="">{labels.noPreference}</option>
                {labels.times.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={label} htmlFor="email">
              {labels.email}
            </label>
            <input id="email" name="email" type="email" dir="ltr" autoComplete="email" className={`mt-1.5 text-start ${field}`} />
            {errors.email ? <p className="mt-1 text-sm text-blood-bright">{errors.email}</p> : null}
          </div>

          <div>
            <label className={label} htmlFor="notes">
              {labels.notes}
            </label>
            <textarea id="notes" name="notes" rows={3} className={`mt-1.5 ${field}`} />
          </div>
        </>
      ) : (
        <input type="hidden" name="program" value={defaultProgram} />
      )}

      <label className="flex items-start gap-3 text-sm text-ash">
        <input type="checkbox" name="consent" required className="mt-1 h-4 w-4 accent-blood" />
        <span>
          {labels.consentBefore}{" "}
          <a href={href(lang, "/privacy")} className="text-blood-bright underline">
            {labels.consentLink}
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
          {labels.unavailableBefore}{" "}
          {wa ? (
            <a
              className="text-blood-bright underline"
              href={`https://wa.me/${wa}?text=${encodeURIComponent(whatsappMessages(lang).trial)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {labels.whatsapp}
            </a>
          ) : (
            <a className="text-blood-bright underline" href={href(lang, "/contact")}>
              {labels.contact}
            </a>
          )}{" "}
          {labels.unavailableAfter}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={status === "submitting"}>
        {status === "submitting" ? labels.sending : labels.submit}
      </Button>
    </form>
  );
}
