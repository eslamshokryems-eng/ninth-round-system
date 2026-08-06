import { domainError, err, ok } from "@9thround/shared-kernel";
import type { LocaleCode, Result, UseCase } from "@9thround/shared-kernel";
import type { UserRoleName } from "../domain/role";
import type { ProfileRepository } from "../domain/profile-repository";

export interface GetCurrentProfileInput {
  profileId: string;
}

export interface GetCurrentProfileOutput {
  profileId: string;
  fullName: string | null;
  role: UserRoleName;
  preferredLocale: LocaleCode;
  isOnboarded: boolean;
  branchId: string | null;
}

/**
 * The read side of Identity: returns a plain DTO, not the `Profile` entity
 * itself, so the presentation layer never imports domain classes for
 * anything beyond types — see docs/13-ddd-architecture.md §13.2. Backs the
 * root layout's routing decision (signed in? onboarded?) in
 * docs/phase-1/06-navigation-flow.md §6.1.
 */
export class GetCurrentProfileUseCase
  implements UseCase<GetCurrentProfileInput, GetCurrentProfileOutput>
{
  constructor(private readonly profiles: ProfileRepository) {}

  async execute(input: GetCurrentProfileInput): Promise<Result<GetCurrentProfileOutput>> {
    const found = await this.profiles.findById(input.profileId);
    if (found.isErr) return found;
    if (!found.value) {
      return err(domainError("PROFILE_NOT_FOUND", `No profile with id ${input.profileId}`));
    }

    const profile = found.value;
    return ok({
      profileId: profile.id,
      fullName: profile.fullName,
      role: profile.role.name,
      preferredLocale: profile.preferredLocale,
      isOnboarded: profile.isOnboarded,
      branchId: profile.branchId,
    });
  }
}
