import { describe, expect, it } from "vitest";
import type { ProfileRow } from "@9thround/database-types";
import { profileToRowUpdate, rowToProfile } from "./profile-mapper";

const row: ProfileRow = {
  id: "profile-1",
  full_name: "Eslam Shokry",
  avatar_url: null,
  role: "member",
  preferred_locale: "ar",
  gender: "male",
  date_of_birth: "1998-03-15",
  height_cm: 178,
  weight_kg: 80.5,
  goal: "muscle_gain",
  experience_level: "beginner",
  onboarding_completed_at: "2026-07-28T10:00:00.000Z",
  referral_code: "abc123",
  referred_by: null,
  branch_id: null,
  last_seen_at: null,
  phone: null,
  address: null,
  employee_code: null,
  is_active: true,
  created_at: "2026-07-01T00:00:00.000Z",
  updated_at: "2026-07-28T10:00:00.000Z",
};

describe("profile-mapper", () => {
  it("rowToProfile maps every field, including parsing date_of_birth", () => {
    const profile = rowToProfile(row);
    expect(profile.id).toBe("profile-1");
    expect(profile.fullName).toBe("Eslam Shokry");
    expect(profile.preferredLocale).toBe("ar");
    expect(profile.gender).toBe("male");
    expect(profile.dateOfBirth?.toISOString().slice(0, 10)).toBe("1998-03-15");
    expect(profile.heightCm).toBe(178);
    expect(profile.weightKg).toBe(80.5);
    expect(profile.isOnboarded).toBe(true);
  });

  it("profileToRowUpdate round-trips a mapped profile back to row shape, date-only for date_of_birth", () => {
    const profile = rowToProfile(row);
    const update = profileToRowUpdate(profile);

    expect(update.full_name).toBe("Eslam Shokry");
    expect(update.gender).toBe("male");
    expect(update.date_of_birth).toBe("1998-03-15");
    expect(update.height_cm).toBe(178);
    expect(update.weight_kg).toBe(80.5);
    expect(update.goal).toBe("muscle_gain");
  });

  it("handles null date_of_birth without throwing", () => {
    const profile = rowToProfile({ ...row, date_of_birth: null });
    expect(profile.dateOfBirth).toBeNull();
    expect(profileToRowUpdate(profile).date_of_birth).toBeNull();
  });
});
