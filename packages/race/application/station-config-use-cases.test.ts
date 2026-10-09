import { describe, expect, it, vi } from "vitest";
import { ok } from "../kernel";
import { judgeKindFromScoring } from "../domain/station-config";
import type { RaceStationConfigRepository } from "../domain/station-config";
import { DemoWorkflowUseCases, StationConfigUseCases } from "./station-config-use-cases";

function repo(): RaceStationConfigRepository {
  const stub = vi.fn(async () => ok({} as never));
  return {
    myAccess: stub, getConfig: stub, preview: stub, update: vi.fn(async () => ok({ version: 2 })), reset: vi.fn(async () => ok({ version: 3 })),
    display: stub, createDemo: stub, addDemoAthletes: stub, lockDemoHeats: vi.fn(async () => ok(undefined)), checkInAllDemo: stub, demoStatus: stub,
  } as unknown as RaceStationConfigRepository;
}

describe("StationConfigUseCases", () => {
  it("refuses an out-of-range station before calling the database", async () => {
    const r = repo();
    const res = await new StationConfigUseCases(r).update("e", 10, { name: "x" }, "why");
    expect(res.isErr).toBe(true);
    expect(r.update).not.toHaveBeenCalled();
  });
  it("requires a reason for update and reset", async () => {
    const r = repo();
    const uc = new StationConfigUseCases(r);
    expect((await uc.update("e", 2, { name: "x" }, "  ")).isErr).toBe(true);
    expect((await uc.reset("e", 2, "")).isErr).toBe(true);
    expect(r.update).not.toHaveBeenCalled();
    expect(r.reset).not.toHaveBeenCalled();
  });
  it("passes a trimmed reason and the patch through", async () => {
    const r = repo();
    await new StationConfigUseCases(r).update("e", 2, { name: "Press-Up" }, " rename ");
    expect(r.update).toHaveBeenCalledWith("e", 2, { name: "Press-Up" }, "rename");
  });
});

describe("DemoWorkflowUseCases", () => {
  it("validates athlete count and heat size", async () => {
    const r = repo();
    const uc = new DemoWorkflowUseCases(r);
    expect((await uc.addAthletes("e", 0, 3)).isErr).toBe(true);
    expect((await uc.addAthletes("e", 28, 3)).isErr).toBe(true);
    expect((await uc.addAthletes("e", 5, 10)).isErr).toBe(true);
    expect(r.addDemoAthletes).not.toHaveBeenCalled();
    await uc.addAthletes("e", 5, 3);
    expect(r.addDemoAthletes).toHaveBeenCalledWith("e", 5, 3);
  });
  it("needs a name for a demo event", async () => {
    expect((await new DemoWorkflowUseCases(repo()).create(" ")).isErr).toBe(true);
  });
});

describe("judgeKindFromScoring", () => {
  it("derives the judge console from the configured scoring type", () => {
    expect(judgeKindFromScoring("CONVERTED_REPS", "laps")).toBe("reps");
    expect(judgeKindFromScoring("REPS", "laps")).toBe("reps");
    expect(judgeKindFromScoring("LAPS", "reps")).toBe("laps");
    expect(judgeKindFromScoring("HOLD_MS", "reps")).toBe("hold");
    expect(judgeKindFromScoring("DISTANCE_M", "reps")).toBe("rowing");
    expect(judgeKindFromScoring(undefined, "laps")).toBe("laps");
  });
});
