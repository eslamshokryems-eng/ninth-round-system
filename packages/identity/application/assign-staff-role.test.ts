import { describe, expect, it } from "vitest";
import { AssignStaffRoleUseCase } from "./assign-staff-role";
import { InMemoryProfileRepository, buildProfile } from "./test-helpers";

describe("AssignStaffRoleUseCase", () => {
  it("lets an admin approve a client as a trainer", async () => {
    const repo = new InMemoryProfileRepository();
    repo.seed(buildProfile({ id: "admin-1", role: "admin" }));
    repo.seed(buildProfile({ id: "client-1", role: "client" }));
    const useCase = new AssignStaffRoleUseCase(repo);

    const result = await useCase.execute({
      actingProfileId: "admin-1",
      targetProfileId: "client-1",
      newRole: "trainer",
    });

    expect(result.isOk).toBe(true);
    const updated = await repo.findById("client-1");
    expect(updated.isOk && updated.value?.role.name).toBe("trainer");
  });

  it("blocks a plain admin from promoting someone to admin", async () => {
    const repo = new InMemoryProfileRepository();
    repo.seed(buildProfile({ id: "admin-1", role: "admin" }));
    repo.seed(buildProfile({ id: "client-1", role: "client" }));
    const useCase = new AssignStaffRoleUseCase(repo);

    const result = await useCase.execute({
      actingProfileId: "admin-1",
      targetProfileId: "client-1",
      newRole: "admin",
    });

    expect(result.isErr && result.error.code).toBe("FORBIDDEN_ROLE_ASSIGNMENT");
    const unchanged = await repo.findById("client-1");
    expect(unchanged.isOk && unchanged.value?.role.name).toBe("client");
  });

  it("lets a super_admin promote someone to admin", async () => {
    const repo = new InMemoryProfileRepository();
    repo.seed(buildProfile({ id: "super-1", role: "super_admin" }));
    repo.seed(buildProfile({ id: "client-1", role: "client" }));
    const useCase = new AssignStaffRoleUseCase(repo);

    const result = await useCase.execute({
      actingProfileId: "super-1",
      targetProfileId: "client-1",
      newRole: "admin",
    });

    expect(result.isOk).toBe(true);
  });

  it("fails with ACTOR_NOT_FOUND when the acting profile doesn't exist", async () => {
    const repo = new InMemoryProfileRepository();
    repo.seed(buildProfile({ id: "client-1", role: "client" }));
    const useCase = new AssignStaffRoleUseCase(repo);

    const result = await useCase.execute({
      actingProfileId: "ghost",
      targetProfileId: "client-1",
      newRole: "trainer",
    });

    expect(result.isErr && result.error.code).toBe("ACTOR_NOT_FOUND");
  });
});
