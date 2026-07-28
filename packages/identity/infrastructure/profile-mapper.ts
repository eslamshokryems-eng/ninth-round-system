import type { ProfileRow } from "@9thround/database-types";
import { Profile } from "../domain/profile";

/**
 * The only place a `profiles` row and a `Profile` entity are allowed to
 * touch. Keeping this mapping in its own module (rather than inline in the
 * repository) makes the "DB shape ≠ domain shape" boundary from
 * docs/13-ddd-architecture.md independently testable.
 */
export function rowToProfile(row: ProfileRow): Profile {
  return Profile.fromPersistence({
    id: row.id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    preferredLocale: row.preferred_locale,
    gender: row.gender,
    dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth) : null,
    heightCm: row.height_cm,
    weightKg: row.weight_kg,
    goal: row.goal,
    experienceLevel: row.experience_level,
    onboardingCompletedAt: row.onboarding_completed_at ? new Date(row.onboarding_completed_at) : null,
    referralCode: row.referral_code,
  });
}

export function profileToRowUpdate(profile: Profile): Partial<ProfileRow> {
  const props = profile.toProps();
  return {
    full_name: props.fullName,
    avatar_url: props.avatarUrl,
    role: props.role,
    preferred_locale: props.preferredLocale,
    gender: props.gender,
    date_of_birth: props.dateOfBirth ? isoDateOnly(props.dateOfBirth) : null,
    height_cm: props.heightCm,
    weight_kg: props.weightKg,
    goal: props.goal,
    experience_level: props.experienceLevel,
    onboarding_completed_at: props.onboardingCompletedAt
      ? props.onboardingCompletedAt.toISOString()
      : null,
  };
}

/** Postgres `date` columns want `YYYY-MM-DD`, not a full timestamp. */
function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
