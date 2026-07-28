import { AggregateRoot, createDomainEvent } from "@9thround/shared-kernel";
import type { LocaleCode } from "@9thround/shared-kernel";
import { Role, type UserRoleName } from "./role";
import type { BodyMetrics } from "./body-metrics";

export type FitnessGoal = "weight_loss" | "muscle_gain" | "general_fitness" | "athletic_performance";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export interface ProfileProps {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: UserRoleName;
  preferredLocale: LocaleCode;
  gender: "female" | "male" | "unspecified" | null;
  dateOfBirth: Date | null;
  heightCm: number | null;
  weightKg: number | null;
  goal: FitnessGoal | null;
  experienceLevel: ExperienceLevel | null;
  onboardingCompletedAt: Date | null;
  referralCode: string;
}

/**
 * The Identity context's aggregate root. Deliberately narrower than the
 * `profiles` table row (see @9thround/database-types) where it can afford to
 * be — a field only earns a place here once domain logic needs to read or
 * change it, not just round-trip it. See docs/13-ddd-architecture.md.
 */
export class Profile extends AggregateRoot<string> {
  private constructor(private props: ProfileProps) {
    super(props.id);
  }

  static fromPersistence(props: ProfileProps): Profile {
    return new Profile(props);
  }

  get fullName(): string | null {
    return this.props.fullName;
  }

  get role(): Role {
    return Role.of(this.props.role);
  }

  get preferredLocale(): LocaleCode {
    return this.props.preferredLocale;
  }

  get isOnboarded(): boolean {
    return this.props.onboardingCompletedAt !== null;
  }

  get onboardingCompletedAt(): Date | null {
    return this.props.onboardingCompletedAt;
  }

  get goal(): FitnessGoal | null {
    return this.props.goal;
  }

  get experienceLevel(): ExperienceLevel | null {
    return this.props.experienceLevel;
  }

  get gender(): "female" | "male" | "unspecified" | null {
    return this.props.gender;
  }

  get dateOfBirth(): Date | null {
    return this.props.dateOfBirth;
  }

  get heightCm(): number | null {
    return this.props.heightCm;
  }

  get weightKg(): number | null {
    return this.props.weightKg;
  }

  /** Snapshot for persistence mapping — infrastructure only, never UI. */
  toProps(): Readonly<ProfileProps> {
    return { ...this.props };
  }

  changePreferredLocale(locale: LocaleCode): void {
    this.props.preferredLocale = locale;
  }

  /**
   * "User Profile Setup" (docs/phase-1/05-screen-list.md) — the display
   * name step of onboarding. Split out from `completeOnboarding` because a
   * user can change their display name later from Settings, long after
   * onboarding is done; onboarding completion is a one-time event, renaming
   * is not.
   */
  setFullName(fullName: string): void {
    const trimmed = fullName.trim();
    if (trimmed.length === 0) {
      throw new Error("Full name cannot be empty.");
    }
    this.props.fullName = trimmed;
  }

  /**
   * Onboarding is complete the moment goal, experience level, and body
   * metrics are all set — this is the one business rule that makes "has
   * this client finished onboarding" a derived fact instead of a
   * client-settable flag, which is what the root layout guard
   * (docs/phase-1/06-navigation-flow.md §6.1) relies on to route between
   * (auth)/onboarding and (tabs).
   */
  completeOnboarding(input: {
    goal: FitnessGoal;
    experienceLevel: ExperienceLevel;
    bodyMetrics: BodyMetrics;
  }): void {
    this.props.goal = input.goal;
    this.props.experienceLevel = input.experienceLevel;
    this.props.gender = input.bodyMetrics.gender;
    this.props.dateOfBirth = input.bodyMetrics.dateOfBirth;
    this.props.heightCm = input.bodyMetrics.heightCm;
    this.props.weightKg = input.bodyMetrics.weightKg;
    this.props.onboardingCompletedAt = new Date();

    this.addDomainEvent(
      createDomainEvent({
        eventType: "profile.onboarding_completed",
        aggregateType: "profile",
        aggregateId: this.props.id,
        profileId: this.props.id,
        payload: { goal: input.goal, experienceLevel: input.experienceLevel },
      }),
    );
  }

  /**
   * Only ever called from the AssignStaffRole use case, which has already
   * checked `actingRole.canAssignRole(newRole)` — the entity still asserts
   * it here too (fail loudly on a caller bug) rather than trusting the
   * use case silently, per the Clean Architecture rule that an aggregate
   * never leaves itself in a state its own invariants would reject.
   */
  assignRole(newRole: UserRoleName, assignedByRole: Role): void {
    if (!assignedByRole.canAssignRole(newRole)) {
      throw new Error(`Role "${assignedByRole.name}" is not permitted to assign "${newRole}".`);
    }
    const previousRole = this.props.role;
    this.props.role = newRole;

    this.addDomainEvent(
      createDomainEvent({
        eventType: "profile.role_changed",
        aggregateType: "profile",
        aggregateId: this.props.id,
        profileId: this.props.id,
        payload: { previousRole, newRole },
      }),
    );
  }
}
