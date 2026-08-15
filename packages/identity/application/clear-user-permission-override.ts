import type { Result, UseCase } from "@9thround/shared-kernel";
import type { PermissionRepository } from "../domain/permission-repository";

export interface ClearUserPermissionOverrideInput {
  profileId: string;
  permissionKey: string;
}

/** Removes a per-user override, reverting that account to its role's default for this permission. */
export class ClearUserPermissionOverrideUseCase implements UseCase<ClearUserPermissionOverrideInput, void> {
  constructor(private readonly permissions: PermissionRepository) {}

  async execute(input: ClearUserPermissionOverrideInput): Promise<Result<void>> {
    return this.permissions.clearUserOverride(input.profileId, input.permissionKey);
  }
}
