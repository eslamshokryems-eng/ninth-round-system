import { domainError, err, ok } from "../kernel";
import type { Result } from "../kernel";
import { checkEligibility } from "./eligibility";
import { isPlausiblePhone } from "./phone";
import type { RegisterAthleteInput } from "./registration";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Client-side pre-check with the SAME codes and order as the database. It
 * exists so an athlete sees the problem before submitting; the database
 * re-checks everything and is the only authority.
 */
export function validateRegistration(input: RegisterAthleteInput): Result<true> {
  const name = input.fullName.trim();
  if (name.length < 2 || name.length > 120) {
    return err(domainError("RACE_INVALID_NAME", "Enter the athlete's full name."));
  }
  if (!isPlausiblePhone(input.phone)) {
    return err(domainError("RACE_INVALID_PHONE", "Enter a valid phone number."));
  }
  const email = input.email?.trim() ?? "";
  if (email !== "" && !EMAIL.test(email)) {
    return err(domainError("RACE_INVALID_EMAIL", "Enter a valid email address."));
  }
  if (!input.waiverAccepted) {
    return err(domainError("RACE_WAIVER_REQUIRED", "The waiver must be accepted to register."));
  }
  if (input.emergencyContact.name.trim() === "" || !isPlausiblePhone(input.emergencyContact.phone)) {
    return err(domainError("RACE_EMERGENCY_CONTACT_REQUIRED", "Enter an emergency contact name and phone number."));
  }
  const eligibility = checkEligibility({
    category: input.category,
    gender: input.gender,
    dateOfBirth: input.dateOfBirth,
    eventDate: input.eventDate,
    pushupStyle: input.pushupStyle,
  });
  if (eligibility.isErr) return eligibility;
  return ok(true);
}
