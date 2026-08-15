import type { Result, UseCase } from "@9thround/shared-kernel";
import type { Permission } from "../domain/permission";
import type { PermissionRepository } from "../domain/permission-repository";

/** Backs the Permissions admin page's full list of grantable keys (members.view, payments.refund, etc.). */
export class ListPermissionCatalogUseCase implements UseCase<void, Permission[]> {
  constructor(private readonly permissions: PermissionRepository) {}

  async execute(): Promise<Result<Permission[]>> {
    return this.permissions.listCatalog();
  }
}
