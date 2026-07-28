import { describe, expect, it } from "vitest";
import { Role } from "./role";

describe("Role", () => {
  it("classifies staff and admin roles correctly", () => {
    expect(Role.of("trainer").isStaff()).toBe(true);
    expect(Role.of("nutritionist").isStaff()).toBe(true);
    expect(Role.of("reception").isStaff()).toBe(true);
    expect(Role.of("client").isStaff()).toBe(false);
    expect(Role.of("admin").isAdmin()).toBe(true);
    expect(Role.of("super_admin").isAdmin()).toBe(true);
    expect(Role.of("trainer").isAdmin()).toBe(false);
  });

  it("lets super_admin assign any role, including admin and super_admin", () => {
    const superAdmin = Role.of("super_admin");
    expect(superAdmin.canAssignRole("admin")).toBe(true);
    expect(superAdmin.canAssignRole("super_admin")).toBe(true);
    expect(superAdmin.canAssignRole("trainer")).toBe(true);
  });

  it("lets a plain admin assign operational roles but never admin/super_admin", () => {
    const admin = Role.of("admin");
    expect(admin.canAssignRole("trainer")).toBe(true);
    expect(admin.canAssignRole("nutritionist")).toBe(true);
    expect(admin.canAssignRole("reception")).toBe(true);
    expect(admin.canAssignRole("client")).toBe(true);
    expect(admin.canAssignRole("admin")).toBe(false);
    expect(admin.canAssignRole("super_admin")).toBe(false);
  });

  it("never lets a non-admin role assign any role", () => {
    expect(Role.of("trainer").canAssignRole("client")).toBe(false);
    expect(Role.of("client").canAssignRole("client")).toBe(false);
  });
});
