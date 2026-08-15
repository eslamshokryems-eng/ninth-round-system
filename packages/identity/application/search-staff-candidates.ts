import { ok } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { UserRoleName } from "../domain/role";
import type { ProfileRepository } from "../domain/profile-repository";

export interface SearchStaffCandidatesInput {
  query: string;
}

export interface StaffCandidate {
  profileId: string;
  fullName: string | null;
  role: UserRoleName;
  branchId: string | null;
  isActive: boolean;
}

/**
 * The read side of "an admin looks up an account to promote/demote"
 * (docs/12-roles-and-permissions.md §12.6). Returns a plain DTO, not the
 * `Profile` entity, per docs/13-ddd-architecture.md §13.2. Mirrors
 * @9thround/reception's SearchMembersUseCase: a short query is treated as
 * "no results yet" rather than an unscoped table scan.
 */
export class SearchStaffCandidatesUseCase
  implements UseCase<SearchStaffCandidatesInput, StaffCandidate[]>
{
  constructor(private readonly profiles: ProfileRepository) {}

  async execute(input: SearchStaffCandidatesInput): Promise<Result<StaffCandidate[]>> {
    if (input.query.trim().length < 2) {
      return ok([]);
    }

    const found = await this.profiles.search(input.query.trim());
    if (found.isErr) return found;

    return ok(
      found.value.map((profile) => ({
        profileId: profile.id,
        fullName: profile.fullName,
        role: profile.role.name,
        branchId: profile.branchId,
        isActive: profile.isActive,
      })),
    );
  }
}
