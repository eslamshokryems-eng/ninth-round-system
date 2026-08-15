import type { UserRoleName } from "./role";

/** One row of the `permissions` catalog (supabase/migrations/20260815000002_permissions_and_staff_status.sql). */
export interface Permission {
  key: string;
  category: string;
  description: string;
}

/** One row of `role_permissions` — a default grant for every account with this role, unless overridden per-user. */
export interface RolePermission {
  role: UserRoleName;
  permissionKey: string;
}

/** One row of `user_permission_overrides` — grants or revokes a single permission for one specific account, overriding its role default. */
export interface UserPermissionOverride {
  profileId: string;
  permissionKey: string;
  granted: boolean;
  grantedBy: string | null;
  createdAt: Date;
}
