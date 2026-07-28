import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { UserRoleName } from "../domain/role";
import type { ProfileRepository } from "../domain/profile-repository";

export interface AssignStaffRoleInput {
  actingProfileId: string;
  targetProfileId: string;
  newRole: UserRoleName;
}

export interface AssignStaffRoleOutput {
  targetProfileId: string;
  newRole: UserRoleName;
}

/**
 * The concrete use case behind "admin approves a trainer" / "super_admin
 * promotes an admin" (docs/12-roles-and-permissions.md §12.3). The
 * permission check itself lives in `Role.canAssignRole` — this use case's
 * job is only to load both profiles, ask the domain, and persist the
 * outcome, so the rule is enforced identically whether it's called from the
 * admin web app or (later) an internal tool.
 */
export class AssignStaffRoleUseCase
  implements UseCase<AssignStaffRoleInput, AssignStaffRoleOutput>
{
  constructor(private readonly profiles: ProfileRepository) {}

  async execute(input: AssignStaffRoleInput): Promise<Result<AssignStaffRoleOutput>> {
    const actingResult = await this.profiles.findById(input.actingProfileId);
    if (actingResult.isErr) return actingResult;
    if (!actingResult.value) {
      return err(domainError("ACTOR_NOT_FOUND", `No profile with id ${input.actingProfileId}`));
    }

    const targetResult = await this.profiles.findById(input.targetProfileId);
    if (targetResult.isErr) return targetResult;
    if (!targetResult.value) {
      return err(domainError("TARGET_NOT_FOUND", `No profile with id ${input.targetProfileId}`));
    }

    const actingProfile = actingResult.value;
    const targetProfile = targetResult.value;

    if (!actingProfile.role.canAssignRole(input.newRole)) {
      return err(
        domainError(
          "FORBIDDEN_ROLE_ASSIGNMENT",
          `Role "${actingProfile.role.name}" cannot assign role "${input.newRole}".`,
        ),
      );
    }

    targetProfile.assignRole(input.newRole, actingProfile.role);

    const saved = await this.profiles.save(targetProfile);
    if (saved.isErr) return saved;

    return ok({ targetProfileId: targetProfile.id, newRole: input.newRole });
  }
}
