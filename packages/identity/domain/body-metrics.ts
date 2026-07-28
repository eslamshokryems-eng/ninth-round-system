import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";

export type Gender = "female" | "male" | "unspecified";

const MIN_AGE = 13;
const MAX_AGE = 100;
const MIN_HEIGHT_CM = 100;
const MAX_HEIGHT_CM = 250;
const MIN_WEIGHT_KG = 30;
const MAX_WEIGHT_KG = 300;

export interface BodyMetricsProps {
  gender: Gender;
  dateOfBirth: Date;
  heightCm: number;
  weightKg: number;
}

/**
 * The body-metrics onboarding screen collects gender, age, height, and
 * weight (docs/phase-1/05-screen-list.md). Age is what the screen shows the
 * user, but `date_of_birth` (see supabase/migrations/20260801000002) is what
 * the schema stores — the mobile UI collects a birth *year* via an age
 * input and converts it here, once, at the domain boundary, rather than
 * inventing a separate "age" column that would go stale.
 *
 * This is a value object, not an entity: two BodyMetrics with the same
 * field values are interchangeable, and it enforces its own validity on
 * construction — a Profile can never end up holding an impossible height.
 */
export class BodyMetrics {
  private constructor(private readonly props: BodyMetricsProps) {}

  static create(input: BodyMetricsProps): Result<BodyMetrics> {
    const age = ageFromDateOfBirth(input.dateOfBirth);
    if (age < MIN_AGE || age > MAX_AGE) {
      return err(domainError("INVALID_AGE", `Age must be between ${MIN_AGE} and ${MAX_AGE}.`));
    }
    if (input.heightCm < MIN_HEIGHT_CM || input.heightCm > MAX_HEIGHT_CM) {
      return err(
        domainError(
          "INVALID_HEIGHT",
          `Height must be between ${MIN_HEIGHT_CM}cm and ${MAX_HEIGHT_CM}cm.`,
        ),
      );
    }
    if (input.weightKg < MIN_WEIGHT_KG || input.weightKg > MAX_WEIGHT_KG) {
      return err(
        domainError(
          "INVALID_WEIGHT",
          `Weight must be between ${MIN_WEIGHT_KG}kg and ${MAX_WEIGHT_KG}kg.`,
        ),
      );
    }
    return ok(new BodyMetrics({ ...input }));
  }

  get gender(): Gender {
    return this.props.gender;
  }

  get dateOfBirth(): Date {
    return this.props.dateOfBirth;
  }

  get heightCm(): number {
    return this.props.heightCm;
  }

  get weightKg(): number {
    return this.props.weightKg;
  }

  get age(): number {
    return ageFromDateOfBirth(this.props.dateOfBirth);
  }
}

/**
 * Deterministic age → approximate date-of-birth conversion (January 1st of
 * the birth year) for the onboarding UI's simple age-number input. Exported
 * standalone (not just via BodyMetrics) so the mobile screen can show a
 * live "you'll be recorded as ~28 years old" preview before submitting.
 */
export function dateOfBirthFromAge(age: number, now: Date = new Date()): Date {
  const birthYear = now.getUTCFullYear() - age;
  return new Date(Date.UTC(birthYear, 0, 1));
}

export function ageFromDateOfBirth(dateOfBirth: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const hasHadBirthdayThisYear =
    now.getUTCMonth() > dateOfBirth.getUTCMonth() ||
    (now.getUTCMonth() === dateOfBirth.getUTCMonth() && now.getUTCDate() >= dateOfBirth.getUTCDate());
  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }
  return age;
}
