import { describe, expect, it } from "vitest";
import { AssignStaffRoleUseCase } from "./assign-staff-role";
import { InMemoryProfileRepository, buildProfile } from "./test-helpers";

describe("AssignStaffRoleUseCase", () => {
  it("lets a branch_manager promote a member to coach", async () => {
    const repo = new InMemoryProfileRepository();
    repo.seed(buildProfile({ id: "branch-manager-1", role: "branch_manager" }));
    repo.seed(buildProfile({ id: "member-1", role: "member" }));
    const useCase = new AssignStaffRoleUseCase(repo);

    const result = await useCase.execute({
      actingProfileId: "branch-manager-1",
      targetProfileId: "member-1",
      newRole: "coach",
    });

    expect(result.isOk).toBe(true);
    const updated = await repo.findById("member-1");
    expect(updated.isOk && updated.value?.role.name).toBe("coach");
  });

  it("blocks a plain branch_manager from promoting someone to branch_manager", async () => {
    const repo = new InMemoryProfileRepository();
    repo.seed(buildProfile({ id: "branch-manager-1", role: "branch_manager" }));
    repo.seed(buildProfile({ id: "member-1", role: "member" }));
    const useCase = new AssignStaffRoleUseCase(repo);

    const result = await useCase.execute({
      actingProfileId: "branch-manager-1",
      targetProfileId: "member-1",
      newRole: "branch_manager",
    });

    expect(result.isErr && result.error.code).toBe("FORBIDDEN_ROLE_ASSIGNMENT");
    const unchanged = await repo.findById("member-1");
    expect(unchanged.isOk && unchanged.value?.role.name).toBe("member");
  });

  it("lets a super_admin promote someone to branch_manager", async () => {
    const repo = new InMemoryProfileRepository();
    repo.seed(buildProfile({ id: "super-1", role: "super_admin" }));
    repo.seed(buildProfile({ id: "member-1", role: "member" }));
    const useCase = new AssignStaffRoleUseCase(repo);

    const result = await useCase.execute({
      actingProfileId: "super-1",
      targetProfileId: "member-1",
      newRole: "branch_manager",
    });

    expect(result.isOk).toBe(true);
  });

  it("fails with ACTOR_NOT_FOUND when the acting profile doesn't exist", async () => {
    const repo = new InMemoryProfileRepository();
    repo.seed(buildProfile({ id: "member-1", role: "member" }));
    const useCase = new AssignStaffRoleUseCase(repo);

    const result = await useCase.execute({
      actingProfileId: "ghost",
      targetProfileId: "member-1",
      newRole: "coach",
    });

    expect(result.isErr && result.error.code).toBe("ACTOR_NOT_FOUND");
  });
});
