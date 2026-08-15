import type { Result, UseCase } from "@9thround/shared-kernel";
import type { UserRoleName } from "../domain/role";
import type { PermissionRepository } from "../domain/permission-repository";

export interface SetRolePermissionInput {
  role: UserRoleName;
  permissionKey: string;
  granted: boolean;
}

/**
 * Changes a role's default for one permission key. The real authorization
 * check (only super_admin may call this) lives in the set_role_permission()
 * SQL function, not here — this use case would fail (and return an error
 * Result) for a non-super_admin caller rather than silently doing nothing,
 * same posture as every other write in this app.
 */
export class SetRolePermissionUseCase implements UseCase<SetRolePermissionInput, void> {
  constructor(private readonly permissions: PermissionRepository) {}

  async execute(input: SetRolePermissionInput): Promise<Result<void>> {
    return this.permissions.setRolePermission(input.role, input.permissionKey, input.granted);
  }
}
