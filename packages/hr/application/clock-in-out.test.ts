import { describe, expect, it } from "vitest";
import { ClockInUseCase } from "./clock-in";
import { ClockOutUseCase } from "./clock-out";
import { InMemoryAttendanceRepository } from "./test-helpers";

describe("ClockInUseCase / ClockOutUseCase", () => {
  it("clocks in successfully when not already clocked in", async () => {
    const useCase = new ClockInUseCase(new InMemoryAttendanceRepository());
    const result = await useCase.execute({ profileId: "profile-1", branchId: "branch-1" });
    expect(result.isOk).toBe(true);
    if (result.isOk) expect(result.value.clockOut).toBeNull();
  });

  it("rejects a second clock-in while already clocked in", async () => {
    const repo = new InMemoryAttendanceRepository();
    const useCase = new ClockInUseCase(repo);
    await useCase.execute({ profileId: "profile-1", branchId: "branch-1" });
    const second = await useCase.execute({ profileId: "profile-1", branchId: "branch-1" });
    expect(second.isErr).toBe(true);
    if (second.isErr) expect(second.error.code).toBe("ALREADY_CLOCKED_IN");
  });

  it("clocks out an open record", async () => {
    const repo = new InMemoryAttendanceRepository();
    await new ClockInUseCase(repo).execute({ profileId: "profile-1", branchId: "branch-1" });
    const result = await new ClockOutUseCase(repo).execute("profile-1");
    expect(result.isOk).toBe(true);
    if (result.isOk) expect(result.value.clockOut).not.toBeNull();
  });

  it("rejects clocking out when not clocked in", async () => {
    const repo = new InMemoryAttendanceRepository();
    const result = await new ClockOutUseCase(repo).execute("profile-1");
    expect(result.isErr).toBe(true);
    if (result.isErr) expect(result.error.code).toBe("NOT_CLOCKED_IN");
  });
});
