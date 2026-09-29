/** User-facing wording for the database's RACE_* error codes (the raw server text is the fallback). */
const MESSAGES: Record<string, string> = {
  RACE_REGISTRATION_CLOSED: "Registration is not open for this event.",
  RACE_ALREADY_REGISTERED: "This athlete is already registered for the event.",
  RACE_WAIVER_REQUIRED: "The waiver must be accepted to register.",
  RACE_EMERGENCY_CONTACT_REQUIRED: "Enter an emergency contact name and phone number.",
  RACE_INVALID_NAME: "Enter the athlete's full name.",
  RACE_INVALID_PHONE: "Enter a valid phone number.",
  RACE_INVALID_EMAIL: "Enter a valid email address.",
  RACE_INVALID_DOB: "Check the date of birth.",
  RACE_INVALID_CATEGORY: "Choose a category.",
  RACE_CATEGORY_GENDER: "That category does not match the athlete's gender.",
  RACE_CATEGORY_AGE: "The athlete is too young for that category on the event date.",
  RACE_DOB_REQUIRED: "Date of birth is required for that category.",
  RACE_PUSHUP_STYLE_NOT_ALLOWED: "That push-up style is not available for this category.",
  RACE_PUSHUP_STYLE_LOCKED: "Push-up style can no longer be changed — Station 02 has started.",
  RACE_NOT_FOUND: "Not found.",
  RACE_FORBIDDEN: "Your account is not allowed to do that for this event.",
  RACE_HEATS_LOCKED: "Heats are locked. Use an authorized change with a reason.",
  RACE_REASON_REQUIRED: "A reason is required.",
  RACE_ALREADY_PAID: "This registration is already paid.",
  RACE_AMOUNT_MISMATCH: "A different amount needs a note explaining why.",
  RACE_REGISTRATION_CANCELLED: "This registration is cancelled.",
  RACE_REFUND_REQUIRED: "Refund the payment first.",
  RACE_ATHLETE_ALREADY_CHECKED_IN: "The athlete is already checked in — use the race-control withdrawal workflow.",
  RACE_INVALID_PAYMENT_METHOD: "Choose cash, InstaPay, Vodafone Cash, card POS or bank transfer.",
  RACE_INVALID_PAYMENT_TRANSITION: "That payment cannot be changed that way.",
  RACE_PAYMENT_REQUIRED: "The registration must be paid or waived first.",
  RACE_HEAT_FULL: "That heat is full (9 athletes).",
  RACE_NUMBERS_EXHAUSTED: "No race numbers left for this event.",
};

export function describeRaceError(code: string, serverMessage?: string): string {
  return MESSAGES[code] ?? serverMessage ?? "Something went wrong. Try again.";
}

/** Extracts `RACE_XXX` from a Postgres exception message ("RACE_XXX: detail" or "RACE_XXX"). */
export function parseRaceErrorCode(message: string): string | null {
  const match = /(RACE_[A-Z_]+)/.exec(message);
  return match ? match[1]! : null;
}
