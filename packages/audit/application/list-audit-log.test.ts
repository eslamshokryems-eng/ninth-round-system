import { describe, expect, it } from "vitest";
import { ListAuditLogUseCase } from "./list-audit-log";
import { InMemoryAuditLogRepository, buildAuditLogEntry } from "./test-helpers";

describe("ListAuditLogUseCase", () => {
  it("filters by action", async () => {
    const repo = new InMemoryAuditLogRepository();
    repo.entries = [
      buildAuditLogEntry({ id: "1", action: "create_member" }),
      buildAuditLogEntry({ id: "2", action: "create_membership" }),
    ];
    const useCase = new ListAuditLogUseCase(repo);

    const result = await useCase.execute({ action: "create_member" });

    expect(result.isOk).toBe(true);
    expect(result.isOk && result.value).toHaveLength(1);
    expect(result.isOk && result.value[0]?.id).toBe("1");
  });

  it("returns everything when no filter is given", async () => {
    const repo = new InMemoryAuditLogRepository();
    repo.entries = [buildAuditLogEntry({ id: "1" }), buildAuditLogEntry({ id: "2" })];
    const useCase = new ListAuditLogUseCase(repo);

    const result = await useCase.execute({});

    expect(result.isOk && result.value).toHaveLength(2);
  });
});
