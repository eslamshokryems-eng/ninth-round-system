import type { Result, UseCase } from "@9thround/shared-kernel";
import type { RolePermission } from "../domain/permission";
import type { PermissionRepository } from "../domain/permission-repository";

/** Backs the Permissions admin page's role-by-role matrix. */
export class ListRolePermissionsUseCase implements UseCase<void, RolePermission[]> {
  constructor(private readonly permissions: PermissionRepository) {}

  async execute(): Promise<Result<RolePermission[]>> {
    return this.permissions.listRolePermissions();
  }
}
