import type { Result, UseCase } from "@9thround/shared-kernel";
import type { PermissionRepository } from "../domain/permission-repository";

/**
 * UI-level convenience check (e.g. "should this button render for the
 * signed-in account") — the second, non-bypassable enforcement layer is
 * always the database: the table/RPC a UI action actually calls has its
 * own RLS policy, which is what actually stops a disallowed action, not
 * this check. See docs/phase-1/17-audit-log-and-permissions.md.
 */
export class CheckPermissionUseCase implements UseCase<string, boolean> {
  constructor(private readonly permissions: PermissionRepository) {}

  async execute(permissionKey: string): Promise<Result<boolean>> {
    return this.permissions.hasPermission(permissionKey);
  }
}
