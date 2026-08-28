/**
 * Server-side validation for the public trial form. Deliberately dependency
 * free. Shared shape between the client form and the API route.
 */

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

const MAX = { name: 120, phone: 32, email: 160, free: 600 } as const;

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
  const errors: Record<string, string> = {};

  // Honeypot: if filled, treat as spam but don't reveal why.
  if (typeof input.company === "string" && input.company.trim() !== "") {
    return { ok: false, errors: { form: "Could not submit. Please try again." } };
  }

  const fullName = clean(input.fullName);
  if (fullName.length < 2) errors.fullName = "Please enter your full name.";
  else if (fullName.length > MAX.name) errors.fullName = "That name is too long.";

  const phoneRaw = clean(input.phone);
  if (phoneRaw.replace(/\D/g, "").length < 8) errors.phone = "Please enter a valid phone number.";
  else if (phoneRaw.length > MAX.phone) errors.phone = "That phone number is too long.";
  const phone = normalisePhone(phoneRaw);

  let email: string | null = null;
  const emailRaw = clean(input.email);
  if (emailRaw) {
    if (emailRaw.length > MAX.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      errors.email = "That email doesn't look right.";
    } else {
      email = emailRaw.toLowerCase();
    }
  }

  if (input.consent !== true) errors.consent = "Please accept the privacy note to continue.";

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

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  // Compose the human-readable interest note. This is the ONLY place the
  // trial preferences land - no schema change to the `leads` table (see
  // the Safety Audit, decision D6 option A).
  const parts: string[] = ["Website trial request."];
  if (program) parts.push(`Program: ${program}.`);
  if (preferredDate) parts.push(`Preferred date: ${preferredDate}.`);
  if (preferredTime) parts.push(`Preferred time: ${preferredTime}.`);
  if (notes) parts.push(`Notes: ${notes}`);
  const interestNotes = parts.join(" ").slice(0, 1000);

  return { ok: true, errors: {}, clean: { fullName, phone, email, gender, interestNotes } };
}
