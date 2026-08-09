import { describe, expect, it } from "vitest";
import { Role } from "./role";

describe("Role", () => {
  it("classifies staff and admin roles correctly", () => {
    expect(Role.of("coach").isStaff()).toBe(true);
    expect(Role.of("reception").isStaff()).toBe(true);
    expect(Role.of("sales_employee").isStaff()).toBe(true);
    expect(Role.of("member").isStaff()).toBe(false);
    expect(Role.of("branch_manager").isAdmin()).toBe(true);
    expect(Role.of("super_admin").isAdmin()).toBe(true);
    expect(Role.of("coach").isAdmin()).toBe(false);
    expect(Role.of("sales_employee").isAdmin()).toBe(false);
  });

  it("lets super_admin assign any role, including branch_manager and super_admin", () => {
    const superAdmin = Role.of("super_admin");
    expect(superAdmin.canAssignRole("branch_manager")).toBe(true);
    expect(superAdmin.canAssignRole("super_admin")).toBe(true);
    expect(superAdmin.canAssignRole("coach")).toBe(true);
  });

  it("lets a branch_manager assign operational roles but never branch_manager/super_admin", () => {
    const branchManager = Role.of("branch_manager");
    expect(branchManager.canAssignRole("coach")).toBe(true);
    expect(branchManager.canAssignRole("reception")).toBe(true);
    expect(branchManager.canAssignRole("sales_employee")).toBe(true);
    expect(branchManager.canAssignRole("member")).toBe(true);
    expect(branchManager.canAssignRole("branch_manager")).toBe(false);
    expect(branchManager.canAssignRole("super_admin")).toBe(false);
  });

  it("never lets a non-admin role assign any role", () => {
    expect(Role.of("coach").canAssignRole("member")).toBe(false);
    expect(Role.of("member").canAssignRole("member")).toBe(false);
  });
});
