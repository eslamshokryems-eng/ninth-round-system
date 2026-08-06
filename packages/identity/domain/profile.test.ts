import { describe, expect, it } from "vitest";
import { Profile } from "./profile";
import { BodyMetrics, dateOfBirthFromAge } from "./body-metrics";
import { Role } from "./role";

function buildProfile() {
  return Profile.fromPersistence({
    id: "profile-1",
    fullName: null,
    avatarUrl: null,
    role: "member",
    preferredLocale: "en",
    gender: null,
    dateOfBirth: null,
    heightCm: null,
    weightKg: null,
    goal: null,
    experienceLevel: null,
    onboardingCompletedAt: null,
    referralCode: "abc123",
  });
}

describe("Profile", () => {
  it("is not onboarded until completeOnboarding is called", () => {
    const profile = buildProfile();
    expect(profile.isOnboarded).toBe(false);
  });

  it("completeOnboarding sets goal, experience, and body metrics together", () => {
    const profile = buildProfile();
    const metrics = BodyMetrics.create({
      gender: "male",
      dateOfBirth: dateOfBirthFromAge(30),
      heightCm: 180,
      weightKg: 82,
    });
    expect(metrics.isOk).toBe(true);
    if (!metrics.isOk) return;

    profile.completeOnboarding({
      goal: "muscle_gain",
      experienceLevel: "intermediate",
      bodyMetrics: metrics.value,
    });

    expect(profile.isOnboarded).toBe(true);
    expect(profile.goal).toBe("muscle_gain");
    expect(profile.experienceLevel).toBe("intermediate");
    expect(profile.heightCm).toBe(180);
    expect(profile.weightKg).toBe(82);
    expect(profile.gender).toBe("male");
  });

  it("completeOnboarding raises a profile.onboarding_completed domain event", () => {
    const profile = buildProfile();
    const metrics = BodyMetrics.create({
      gender: "unspecified",
      dateOfBirth: dateOfBirthFromAge(22),
      heightCm: 170,
      weightKg: 65,
    });
    if (!metrics.isOk) throw new Error("expected valid metrics");

    profile.completeOnboarding({
      goal: "general_fitness",
      experienceLevel: "beginner",
      bodyMetrics: metrics.value,
    });

    const events = profile.pullDomainEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("profile.onboarding_completed");
  });

  it("setFullName trims whitespace and rejects an empty name", () => {
    const profile = buildProfile();
    profile.setFullName("  Eslam Shokry  ");
    expect(profile.fullName).toBe("Eslam Shokry");

    expect(() => profile.setFullName("   ")).toThrow();
  });

  it("assignRole delegates to the acting Role's canAssignRole rule", () => {
    const profile = buildProfile();
    expect(() => profile.assignRole("branch_manager", Role.of("branch_manager"))).toThrow();

    profile.assignRole("coach", Role.of("branch_manager"));
    expect(profile.role.name).toBe("coach");
  });
});
