"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { whatsappHrefWithText } from "../lib/whatsapp-link";
import { PROGRAMS } from "../data/programs";
import { useLanguage } from "../i18n/language-provider";
import { trackTrialFormStart, trackTrialFormSubmit, trackWhatsAppClick } from "../lib/analytics";
import { getStoredUtm } from "../lib/utm";

/**
 * Submits to /api/trial, which creates a lead (source "website", status
 * "new") in the Sales CRM through a narrow Supabase RPC. trial_form_submit /
 * Meta Lead fire only after the server confirms the lead was stored, so the
 * conversion count matches real leads. Analytics carry page + form type +
 * session UTM only, never the field values.
 *
 * If saving fails (offline, backend unavailable) the visitor is told so and
 * given a WhatsApp link with the details pre-filled, so no one is lost.
 */
export function TrialForm() {
  const { dict, locale } = useLanguage();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorKind, setErrorKind] = useState<null | "invalid" | "failed">(null);
  const [company, setCompany] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [program, setProgram] = useState(PROGRAMS[0]?.slug ?? "");
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [notes, setNotes] = useState("");
  const hasStarted = useRef(false);

  function handleFormStart() {
    if (hasStarted.current) return;
    hasStarted.current = true;
    trackTrialFormStart("/trial");
  }

  const programName = PROGRAMS.find((item) => item.slug === program)?.name[locale] ?? program;

  function whatsappHref(): string {
    const text =
      locale === "ar"
        ? `أهلاً، أنا ${fullName || ""} وعايز أحجز أول حصة مجانية (${programName}) — من الموقع.`
        : `Hi, I'm ${fullName || ""} and I'd like to book my free trial (${programName}) — from the website.`;
    return whatsappHrefWithText(text);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSending) return;
    setIsSending(true);
    setErrorKind(null);
    try {
      const response = await fetch("/api/trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          phone,
          program,
          preferredDate,
          preferredTime,
          notes,
          company,
          utm: getStoredUtm(),
        }),
      });
      if (response.ok) {
        setIsSubmitted(true);
        trackTrialFormSubmit("/trial", getStoredUtm());
      } else {
        setErrorKind(response.status === 400 ? "invalid" : "failed");
      }
    } catch {
      setErrorKind("failed");
    } finally {
      setIsSending(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="rounded-card border border-red/40 bg-red/10 p-6 text-center">
        <p className="text-lg font-bold text-bone">
          {fullName || (locale === "ar" ? "تمام" : "Got it")}!
        </p>
        <p className="mt-2 text-sm text-grey">
          {locale === "ar"
            ? "وصلنا طلبك. هنتواصل معاك قريب لتأكيد موعد أول حصة مجانية."
            : "We got your request. We'll contact you shortly to confirm your free first session."}
        </p>
        <a
          href={whatsappHref()}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackWhatsAppClick("/trial", "trial_success")}
          className="mt-4 inline-block text-sm font-bold text-bone underline underline-offset-4"
        >
          {locale === "ar" ? "عايز تسرّع التأكيد؟ كلمنا على الواتساب" : "Want a faster confirmation? Message us on WhatsApp"}
        </a>
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
          onFocus={handleFormStart}
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

      {/* Honeypot — hidden from people and screen readers, bots fill it in. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Company
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </label>
      </div>

      {errorKind && (
        <p role="alert" className="rounded-lg border border-red/40 bg-red/10 px-3 py-2 text-sm text-bone">
          {errorKind === "invalid"
            ? locale === "ar"
              ? "راجع الاسم ورقم التليفون وجرّب تاني."
              : "Please check your name and phone number and try again."
            : locale === "ar"
              ? "حصلت مشكلة وطلبك ماتسجلش. كلمنا على الواتساب وهنحجزلك."
              : "Something went wrong and your request wasn't saved. Message us on WhatsApp and we'll book you in."}
          {errorKind === "failed" && (
            <>
              {" "}
              <a
                href={whatsappHref()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackWhatsAppClick("/trial", "trial_error")}
                className="font-bold underline underline-offset-4"
              >
                WhatsApp
              </a>
            </>
          )}
        </p>
      )}

      <button
        type="submit"
        disabled={isSending}
        className="w-full rounded-pill bg-red px-6 py-3 text-sm font-bold uppercase tracking-wide text-bone transition-colors hover:bg-red/90 disabled:opacity-60"
      >
        {isSending ? (locale === "ar" ? "جاري الإرسال..." : "Sending...") : dict.pages.trial.formSubmit}
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
