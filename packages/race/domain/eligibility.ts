import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";

export type RaceCategoryCode = "MEN" | "WOMEN" | "MASTERS";
export type RaceGender = "male" | "female" | "unspecified";
export type PushupStyle = "STANDARD" | "KNEE";

export const RACE_CATEGORIES: readonly {
  code: RaceCategoryCode;
  name: string;
  defaultPushupStyle: PushupStyle;
  minAge: number | null;
}[] = [
  { code: "MEN", name: "Men", defaultPushupStyle: "STANDARD", minAge: null },
  { code: "WOMEN", name: "Women", defaultPushupStyle: "KNEE", minAge: null },
  { code: "MASTERS", name: "Masters 40+", defaultPushupStyle: "KNEE", minAge: 40 },
];

export function defaultPushupStyle(category: RaceCategoryCode): PushupStyle {
  return RACE_CATEGORIES.find((c) => c.code === category)?.defaultPushupStyle ?? "KNEE";
}

/** The push-up styles an athlete of this category may select: the default, or Knee ("any athlete may choose Knee"). */
export function allowedPushupStyles(category: RaceCategoryCode): PushupStyle[] {
  return defaultPushupStyle(category) === "STANDARD" ? ["STANDARD", "KNEE"] : ["KNEE"];
}

function parseDate(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** Whole years between two YYYY-MM-DD dates (birthday-exact, timezone-free). Null for an unparseable date. */
export function ageOnDate(dateOfBirth: string, onDate: string): number | null {
  const dob = parseDate(dateOfBirth);
  const on = parseDate(onDate);
  if (!dob || !on) return null;
  let age = on.y - dob.y;
  if (on.m < dob.m || (on.m === dob.m && on.d < dob.d)) age -= 1;
  return age;
}

export interface EligibilityInput {
  category: RaceCategoryCode;
  gender: RaceGender | null;
  dateOfBirth: string | null;
  eventDate: string;
  pushupStyle: PushupStyle | null;
}

/**
 * Same rules, same error codes and same order as race_register_core() in the
 * database (asserted by the shared parity cases). Returns the push-up style
 * the registration will get.
 */
export function checkEligibility(input: EligibilityInput): Result<{ pushupStyle: PushupStyle }> {
  const category = RACE_CATEGORIES.find((c) => c.code === input.category);
  if (!category) return err(domainError("RACE_INVALID_CATEGORY", "Choose a category."));

  let age: number | null = null;
  if (input.dateOfBirth !== null) {
    age = ageOnDate(input.dateOfBirth, input.eventDate);
    if (age === null || input.dateOfBirth >= input.eventDate || age > 110) {
      return err(domainError("RACE_INVALID_DOB", "Check the date of birth."));
    }
  }
  if (input.category === "MEN" && input.gender !== "male") {
    return err(domainError("RACE_CATEGORY_GENDER", "The Men category is for male athletes."));
  }
  if (input.category === "WOMEN" && input.gender !== "female") {
    return err(domainError("RACE_CATEGORY_GENDER", "The Women category is for female athletes."));
  }
  if (category.minAge !== null) {
    if (age === null) {
      return err(domainError("RACE_DOB_REQUIRED", `Date of birth is required for the ${category.name} category.`));
    }
    if (age < category.minAge) {
      return err(
        domainError("RACE_CATEGORY_AGE", `${category.name} is for athletes aged ${category.minAge} or older on the event date.`),
      );
    }
  }
  const pushupStyle = input.pushupStyle ?? category.defaultPushupStyle;
  if (pushupStyle === "STANDARD" && category.defaultPushupStyle !== "STANDARD") {
    return err(domainError("RACE_PUSHUP_STYLE_NOT_ALLOWED", `${category.name} athletes use Knee push-ups.`));
  }
  return ok({ pushupStyle });
}
