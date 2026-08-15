import type { Result } from "@9thround/shared-kernel";
import type { Permission, RolePermission, UserPermissionOverride } from "./permission";
import type { UserRoleName } from "./role";

/**
 * Every write here maps to a SECURITY DEFINER SQL function
 * (set_role_permission()/set_user_permission_override()/clear_user_
 * permission_override(), all defined in 20260815000002_permissions_and_
 * staff_status.sql), which re-checks is_super_admin() itself and logs the
 * change — this repository does not need to (and could not, without
 * duplicating that check insecurely) re-implement that authorization.
 */
export interface PermissionRepository {
  listCatalog(): Promise<Result<Permission[]>>;
  listRolePermissions(): Promise<Result<RolePermission[]>>;
  listUserOverrides(profileId?: string): Promise<Result<UserPermissionOverride[]>>;
  setRolePermission(role: UserRoleName, permissionKey: string, granted: boolean): Promise<Result<void>>;
  setUserOverride(profileId: string, permissionKey: string, granted: boolean): Promise<Result<void>>;
  clearUserOverride(profileId: string, permissionKey: string): Promise<Result<void>>;
  /** Wraps the has_permission() SQL function — for UI-level convenience checks only; the real gate is always the callee table/RPC's own RLS. */
  hasPermission(permissionKey: string): Promise<Result<boolean>>;
}
