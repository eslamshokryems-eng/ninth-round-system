import type { Result, UseCase } from "@9thround/shared-kernel";
import type { UserPermissionOverride } from "../domain/permission";
import type { PermissionRepository } from "../domain/permission-repository";

export interface ListUserPermissionOverridesInput {
  profileId?: string;
}

/** Backs the Permissions admin page's per-user override list — all overrides, or just one account's when profileId is given. */
export class ListUserPermissionOverridesUseCase
  implements UseCase<ListUserPermissionOverridesInput, UserPermissionOverride[]>
{
  constructor(private readonly permissions: PermissionRepository) {}

  async execute(input: ListUserPermissionOverridesInput): Promise<Result<UserPermissionOverride[]>> {
    return this.permissions.listUserOverrides(input.profileId);
  }
}
