/**
 * The 6-role model (docs/12-roles-and-permissions.md). Modeled as a value
 * object rather than a bare string union so the "can X manage/act-as Y"
 * rules — the actual reason admin and super_admin are different roles — are
 * one tested piece of domain logic, not re-derived ad hoc in every use case
 * or RLS policy that needs to reason about it.
 */
export const USER_ROLES = [
  "client",
  "trainer",
  "nutritionist",
  "reception",
  "admin",
  "super_admin",
] as const;
export type UserRoleName = (typeof USER_ROLES)[number];

const STAFF_ROLES: ReadonlySet<UserRoleName> = new Set(["trainer", "nutritionist", "reception"]);
const ADMIN_ROLES: ReadonlySet<UserRoleName> = new Set(["admin", "super_admin"]);

export class Role {
  private constructor(public readonly name: UserRoleName) {}

  static of(name: UserRoleName): Role {
    return new Role(name);
  }

  isClient(): boolean {
    return this.name === "client";
  }

  isStaff(): boolean {
    return STAFF_ROLES.has(this.name);
  }

  isAdmin(): boolean {
    return ADMIN_ROLES.has(this.name);
  }

  isSuperAdmin(): boolean {
    return this.name === "super_admin";
  }

  /**
   * The rule this whole value object exists for: super_admin can grant or
   * revoke ANY role, including admin/super_admin itself. A plain admin can
   * grant operational roles (trainer/nutritionist/reception/client) but
   * cannot create or demote another admin or super_admin — that would let
   * any admin escalate privilege, which is exactly what the two-tier admin
   * split (requirement: multi-role platform, admin vs super_admin) exists
   * to prevent. See docs/12-roles-and-permissions.md §12.3.
   */
  canAssignRole(targetRole: UserRoleName): boolean {
    if (this.isSuperAdmin()) return true;
    if (this.name === "admin") return !ADMIN_ROLES.has(targetRole);
    return false;
  }

  equals(other: Role): boolean {
    return this.name === other.name;
  }
}
