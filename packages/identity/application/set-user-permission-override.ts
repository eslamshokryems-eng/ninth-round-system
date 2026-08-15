import type { Result, UseCase } from "@9thround/shared-kernel";
import type { PermissionRepository } from "../domain/permission-repository";

export interface SetUserPermissionOverrideInput {
  profileId: string;
  permissionKey: string;
  granted: boolean;
}

/** Grants or revokes one permission for a specific account, overriding its role's default. Authorization (super_admin only) is enforced by set_user_permission_override() in the database. */
export class SetUserPermissionOverrideUseCase implements UseCase<SetUserPermissionOverrideInput, void> {
  constructor(private readonly permissions: PermissionRepository) {}

  async execute(input: SetUserPermissionOverrideInput): Promise<Result<void>> {
    return this.permissions.setUserOverride(input.profileId, input.permissionKey, input.granted);
  }
}
