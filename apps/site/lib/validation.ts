/**
 * Server-side validation for the public trial form. Deliberately dependency
 * free. Shared shape between the client form and the API route.
 *
 * Error messages come back in the visitor's language: the form renders
 * whatever the server returns, so an Arabic page must not surface an
 * English validation error.
 */

export type FormLang = "ar" | "en";

export interface TrialFormInput {
  fullName: string;
  phone: string;
  email?: string;
  program?: string;
  preferredDate?: string;
  preferredTime?: string;
  notes?: string;
  gender?: string;
  consent: boolean;
  /** Which language the visitor filled the form in. */
  lang?: string;
  /** Ad-campaign tag, when the lead came from a /go/* landing page. */
  campaign?: string;
  /** Honeypot - must be empty. Real users never see this field. */
  company?: string;
  /** Cloudflare Turnstile token, when the widget is enabled. */
  turnstileToken?: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: Record<string, string>;
  /** Cleaned values, present only when ok === true. */
  clean?: {
    fullName: string;
    phone: string;
    email: string | null;
    gender: "female" | "male" | "unspecified" | null;
    interestNotes: string;
  };
}

const MAX = { name: 120, phone: 32, email: 160, free: 600, campaign: 60 } as const;

const MESSAGES = {
  en: {
    name: "Please enter your full name.",
    nameLong: "That name is too long.",
    phone: "Please enter a valid phone number.",
    phoneLong: "That phone number is too long.",
    email: "That email doesn't look right.",
    consent: "Please accept the privacy note to continue.",
    generic: "Could not submit. Please try again.",
    rateLimit: "Too many requests. Please wait a moment and try again.",
    unverified: "Could not verify the request. Please reload and try again.",
    invalid: "Invalid request.",
  },
  ar: {
    name: "اكتب اسمك بالكامل من فضلك.",
    nameLong: "الاسم ده طويل أوي.",
    phone: "اكتب رقم تليفون صحيح من فضلك.",
    phoneLong: "الرقم ده طويل أوي.",
    email: "الإيميل ده شكله مش مظبوط.",
    consent: "وافق على إشعار الخصوصية عشان تكمّل.",
    generic: "مانفعش نبعت الطلب. جرب تاني من فضلك.",
    rateLimit: "طلبات كتير أوي. استنى شوية وجرب تاني.",
    unverified: "مانفعش نتأكد من الطلب. اعمل ريفريش وجرب تاني.",
    invalid: "طلب غير صالح.",
  },
};

export type Messages = { [K in keyof typeof MESSAGES.en]: string };

export function messages(lang: string | undefined): Messages {
  return lang === "ar" ? MESSAGES.ar : MESSAGES.en;
}

// Strip ASCII control bytes (hex-escaped so the source has no literal
// control characters), then collapse ordinary whitespace.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

function clean(s: unknown): string {
  return String(s ?? "")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalise an Egyptian-style phone to digits with a country code. */
export function normalisePhone(raw: string): string {
  let d = raw.replace(/[^\d+]/g, "");
  d = d.replace(/(?!^)\+/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = `20${d.slice(1)}`;
  if (!d.startsWith("20") && d.length <= 11) d = `20${d}`;
  return d;
}

export function validateTrialForm(input: Partial<TrialFormInput>): ValidationResult {
  const m = messages(input.lang);
  const errors: Record<string, string> = {};

  // Honeypot: if filled, treat as spam but don't reveal why.
  if (typeof input.company === "string" && input.company.trim() !== "") {
    return { ok: false, errors: { form: m.generic } };
  }

  const fullName = clean(input.fullName);
  if (fullName.length < 2) errors.fullName = m.name;
  else if (fullName.length > MAX.name) errors.fullName = m.nameLong;

  const phoneRaw = clean(input.phone);
  if (phoneRaw.replace(/\D/g, "").length < 8) errors.phone = m.phone;
  else if (phoneRaw.length > MAX.phone) errors.phone = m.phoneLong;
  const phone = normalisePhone(phoneRaw);

  let email: string | null = null;
  const emailRaw = clean(input.email);
  if (emailRaw) {
    if (emailRaw.length > MAX.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      errors.email = m.email;
    } else {
      email = emailRaw.toLowerCase();
    }
  }

  if (input.consent !== true) errors.consent = m.consent;

  const genderIn = clean(input.gender).toLowerCase();
  const gender =
    genderIn === "female" || genderIn === "male"
      ? (genderIn as "female" | "male")
      : genderIn === "unspecified"
        ? "unspecified"
        : null;

  const program = clean(input.program).slice(0, 80);
  const preferredDate = clean(input.preferredDate).slice(0, 40);
  const preferredTime = clean(input.preferredTime).slice(0, 40);
  const notes = clean(input.notes).slice(0, MAX.free);
  const campaign = clean(input.campaign).slice(0, MAX.campaign);
  const lang = input.lang === "ar" ? "ar" : "en";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // Compose the human-readable interest note. This is the ONLY place the
  // trial preferences land - no schema change to the `leads` table (see
  // the Safety Audit, decision D6 option A).
  //
  // The note is always English so the Sales app reads one format, but it
  // records which language the visitor used — that tells the team which
  // language to call back in, which is the difference between a warm
  // follow-up and a confusing one.
  const parts: string[] = [campaign ? `Website trial request [${campaign}].` : "Website trial request."];
  if (program) parts.push(`Program: ${program}.`);
  if (preferredDate) parts.push(`Preferred date: ${preferredDate}.`);
  if (preferredTime) parts.push(`Preferred time: ${preferredTime}.`);
  parts.push(`Language: ${lang}.`);
  if (notes) parts.push(`Notes: ${notes}`);
  const interestNotes = parts.join(" ").slice(0, 1000);

  return { ok: true, errors: {}, clean: { fullName, phone, email, gender, interestNotes } };
}
