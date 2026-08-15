import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { Permission, RolePermission, UserPermissionOverride } from "../domain/permission";
import type { PermissionRepository } from "../domain/permission-repository";
import type { UserRoleName } from "../domain/role";

export class SupabasePermissionRepository implements PermissionRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async listCatalog(): Promise<Result<Permission[]>> {
    const { data, error } = await this.client.from("permissions").select("*").order("category").order("key");
    if (error) return err(domainError("PERMISSION_CATALOG_FETCH_FAILED", error.message));
    return ok((data ?? []).map((row) => ({ key: row.key, category: row.category, description: row.description })));
  }

  async listRolePermissions(): Promise<Result<RolePermission[]>> {
    const { data, error } = await this.client.from("role_permissions").select("*");
    if (error) return err(domainError("ROLE_PERMISSIONS_FETCH_FAILED", error.message));
    return ok((data ?? []).map((row) => ({ role: row.role, permissionKey: row.permission_key })));
  }

  async listUserOverrides(profileId?: string): Promise<Result<UserPermissionOverride[]>> {
    let query = this.client.from("user_permission_overrides").select("*");
    if (profileId) query = query.eq("profile_id", profileId);
    const { data, error } = await query;
    if (error) return err(domainError("USER_OVERRIDES_FETCH_FAILED", error.message));
    return ok(
      (data ?? []).map((row) => ({
        profileId: row.profile_id,
        permissionKey: row.permission_key,
        granted: row.granted,
        grantedBy: row.granted_by,
        createdAt: new Date(row.created_at),
      })),
    );
  }

  async setRolePermission(role: UserRoleName, permissionKey: string, granted: boolean): Promise<Result<void>> {
    const { error } = await this.client.rpc("set_role_permission", { p_role: role, p_permission_key: permissionKey, p_granted: granted });
    if (error) return err(domainError("SET_ROLE_PERMISSION_FAILED", error.message));
    return ok(undefined);
  }

  async setUserOverride(profileId: string, permissionKey: string, granted: boolean): Promise<Result<void>> {
    const { error } = await this.client.rpc("set_user_permission_override", {
      p_profile_id: profileId,
      p_permission_key: permissionKey,
      p_granted: granted,
    });
    if (error) return err(domainError("SET_USER_OVERRIDE_FAILED", error.message));
    return ok(undefined);
  }

  async clearUserOverride(profileId: string, permissionKey: string): Promise<Result<void>> {
    const { error } = await this.client.rpc("clear_user_permission_override", {
      p_profile_id: profileId,
      p_permission_key: permissionKey,
    });
    if (error) return err(domainError("CLEAR_USER_OVERRIDE_FAILED", error.message));
    return ok(undefined);
  }

  async hasPermission(permissionKey: string): Promise<Result<boolean>> {
    const { data, error } = await this.client.rpc("has_permission", { p_permission_key: permissionKey });
    if (error) return err(domainError("HAS_PERMISSION_CHECK_FAILED", error.message));
    return ok(data ?? false);
  }
}
