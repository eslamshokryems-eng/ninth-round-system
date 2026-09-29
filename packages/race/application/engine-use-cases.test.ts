import { describe, expect, it } from "vitest";
import { ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { RaceEngineRepository } from "../domain/race-engine-repository";
import {
  AdvanceRaceUseCase,
  CorrectCheckInUseCase,
  MarkDnfUseCase,
  MoveToLaterHeatUseCase,
  OverrideDnsUseCase,
  PauseRaceUseCase,
  ResumeRaceUseCase,
  SkipAthleteUseCase,
  StartEventUseCase,
  StartNextHeatUseCase,
} from "./engine-use-cases";

/** Every call recorded; every result a canned success. The point is what reaches the repository — and what does NOT. */
function fake() {
  const calls: { method: string; args: unknown[] }[] = [];
  const rec = <T>(method: string, args: unknown[], value: T): Promise<Result<T>> => {
    calls.push({ method, args });
    return Promise.resolve(ok(value));
  };
  const repo: RaceEngineRepository = {
    startEvent: (e) => rec("startEvent", [e], { startedAt: "t", firstStartMs: 60000, heatsAnchored: 1 }),
    pause: (e, r) => rec("pause", [e, r], { pausedAt: "t", pausedRaceMs: 1 }),
    resume: (e) => rec("resume", [e], { resumedAt: "t", pausedMs: 1, raceMs: 1 }),
    advance: (e) => rec("advance", [e], { busy: false, advanced: true, raceMs: 1, athletesStarted: 0, athletesFinished: 0, eventFinished: false }),
    controlState: (e) => rec("controlState", [e], {} as never),
    skipAthlete: (s, r) => rec("skipAthlete", [s, r], { heatNumber: 1, slotIndex: 0, raceNumber: "N001" }),
    markDnf: (a, r) => rec("markDnf", [a, r], true as const),
    startNextHeat: (e, h) => rec("startNextHeat", [e, h], { heatNumber: h, anchorMs: 1 }),
    correctCheckIn: (o, n, r) => rec("correctCheckIn", [o, n, r], { correctionId: "c", newCheckInId: "n", queuePosition: 1, heatNumber: 1, slotRebound: false }),
    overrideDns: (a, r) => rec("overrideDns", [a, r], { outcome: "QUEUED" as const, queuePosition: 1, heatNumber: 1, slotIndex: null }),
    moveToLaterHeat: (a, h, r) => rec("moveToLaterHeat", [a, h, r], { heatNumber: h, queuePosition: 1, slotIndex: null }),
  };
  return { repo, calls };
}

describe("engine use cases — inputs that never reach the database", () => {
  it("START EVENT, RESUME and the tick need an event", async () => {
    const { repo, calls } = fake();
    for (const uc of [new StartEventUseCase(repo), new ResumeRaceUseCase(repo), new AdvanceRaceUseCase(repo)]) {
      const r = await uc.execute("  ");
      expect(r.isErr).toBe(true);
    }
    expect(calls).toEqual([]);
  });

  it("SKIP, DNF, DNS override and move all demand a written reason", async () => {
    const { repo, calls } = fake();
    const results = await Promise.all([
      new SkipAthleteUseCase(repo).execute({ slotId: "s", reason: "  " }),
      new MarkDnfUseCase(repo).execute({ registrationId: "r", reason: "" }),
      new OverrideDnsUseCase(repo).execute({ registrationId: "r", reason: " \n" }),
      new MoveToLaterHeatUseCase(repo).execute({ registrationId: "r", targetHeatNumber: 3, reason: "" }),
      new CorrectCheckInUseCase(repo).execute({ wrongRegistrationId: "a", rightRegistrationId: "b", reason: "" }),
    ]);
    for (const r of results) {
      expect(r.isErr && r.error.code).toBe("RACE_REASON_REQUIRED");
    }
    expect(calls).toEqual([]);
  });

  it("a correction needs two different athletes", async () => {
    const { repo, calls } = fake();
    const r = await new CorrectCheckInUseCase(repo).execute({ wrongRegistrationId: "a", rightRegistrationId: "a", reason: "typo" });
    expect(r.isErr && r.error.code).toBe("RACE_CORRECTION_SAME_ATHLETE");
    expect(calls).toEqual([]);
  });

  it("heat numbers must be real", async () => {
    const { repo, calls } = fake();
    expect((await new StartNextHeatUseCase(repo).execute({ eventId: "e", heatNumber: 0 })).isErr).toBe(true);
    expect((await new StartNextHeatUseCase(repo).execute({ eventId: "e", heatNumber: 1.5 })).isErr).toBe(true);
    expect((await new MoveToLaterHeatUseCase(repo).execute({ registrationId: "r", targetHeatNumber: -1, reason: "x" })).isErr).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe("engine use cases — what does reach the database", () => {
  it("trims the reason and passes only ids: no time, order or position parameter exists", async () => {
    const { repo, calls } = fake();
    await new SkipAthleteUseCase(repo).execute({ slotId: "slot-1", reason: "  not at start line " });
    await new OverrideDnsUseCase(repo).execute({ registrationId: "reg-1", reason: " arrived " });
    await new MoveToLaterHeatUseCase(repo).execute({ registrationId: "reg-1", targetHeatNumber: 2, reason: " late " });
    await new CorrectCheckInUseCase(repo).execute({ wrongRegistrationId: "a", rightRegistrationId: "b", reason: " wristband " });
    expect(calls).toEqual([
      { method: "skipAthlete", args: ["slot-1", "not at start line"] },
      { method: "overrideDns", args: ["reg-1", "arrived"] },
      { method: "moveToLaterHeat", args: ["reg-1", 2, "late"] },
      { method: "correctCheckIn", args: ["a", "b", "wristband"] },
    ]);
  });

  it("EMERGENCY PAUSE works with no reason at all (panic button) and passes null", async () => {
    const { repo, calls } = fake();
    await new PauseRaceUseCase(repo).execute({ eventId: "e" });
    await new PauseRaceUseCase(repo).execute({ eventId: "e", reason: "   " });
    await new PauseRaceUseCase(repo).execute({ eventId: "e", reason: " medical " });
    expect(calls.map((c) => c.args[1])).toEqual([null, null, "medical"]);
  });
});
