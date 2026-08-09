/**
 * The 6-role club-management model (docs/12-roles-and-permissions.md,
 * updated for the 9th Round Reception & Membership System). Modeled as a
 * value object rather than a bare string union so the "can X manage/act-as
 * Y" rules — the actual reason branch_manager and super_admin are
 * different roles — are one tested piece of domain logic, not re-derived
 * ad hoc in every use case or RLS policy that needs to reason about it.
 */
export const USER_ROLES = [
  "member",
  "coach",
  "reception",
  "sales_employee",
  "branch_manager",
  "super_admin",
] as const;
export type UserRoleName = (typeof USER_ROLES)[number];

const STAFF_ROLES: ReadonlySet<UserRoleName> = new Set(["coach", "reception", "sales_employee"]);
const ADMIN_ROLES: ReadonlySet<UserRoleName> = new Set(["branch_manager", "super_admin"]);

export class Role {
  private constructor(public readonly name: UserRoleName) {}

  static of(name: UserRoleName): Role {
    return new Role(name);
  }

  isMember(): boolean {
    return this.name === "member";
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
   * revoke ANY role, including branch_manager/super_admin itself. A plain
   * branch_manager can grant operational roles (coach/reception/
   * sales_employee/member) but cannot create or demote another
   * branch_manager or super_admin — that
   * would let any branch manager escalate privilege, which is exactly what
   * the two-tier admin split exists to prevent. See
   * docs/12-roles-and-permissions.md §12.3.
   */
  canAssignRole(targetRole: UserRoleName): boolean {
    if (this.isSuperAdmin()) return true;
    if (this.name === "branch_manager") return !ADMIN_ROLES.has(targetRole);
    return false;
  }

  equals(other: Role): boolean {
    return this.name === other.name;
  }
}
