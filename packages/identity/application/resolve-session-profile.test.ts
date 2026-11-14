import { describe, expect, it } from "vitest";
import { domainError, err, ok } from "@9thround/shared-kernel";
import { resolveSessionProfile } from "./resolve-session-profile";

const profile = { profileId: "p1", fullName: "A", role: "sales_employee" as const, preferredLocale: "en" as const, isOnboarded: true, branchId: "b1" };
const noSleep = async () => {};

describe("resolveSessionProfile", () => {
  it("returns the profile when it loads", async () => {
    expect(await resolveSessionProfile(async () => ok(profile), { sleep: noSleep })).toEqual({ kind: "signed-in", profile });
  });

  it("a definitively missing profile signs the user out (no retries)", async () => {
    let calls = 0;
    const out = await resolveSessionProfile(async () => { calls++; return err(domainError("PROFILE_NOT_FOUND", "x")); }, { sleep: noSleep });
    expect(out).toEqual({ kind: "signed-out" });
    expect(calls).toBe(1);
  });

  it("a transient failure is retried and recovers — the employee is NOT signed out", async () => {
    let calls = 0;
    const out = await resolveSessionProfile(async () => (++calls < 3 ? err(domainError("PROFILE_FETCH_FAILED", "canceling statement due to statement timeout")) : ok(profile)), { sleep: noSleep });
    expect(out.kind).toBe("signed-in");
    expect(calls).toBe(3);
  });

  it("a persistent transient failure ends as 'unavailable', never as signed-out", async () => {
    const slept: number[] = [];
    const out = await resolveSessionProfile(async () => err(domainError("PROFILE_FETCH_FAILED", "Failed to fetch")), { sleep: async (ms) => { slept.push(ms); } });
    expect(out).toEqual({ kind: "unavailable" });
    expect(slept).toEqual([1000, 3000, 7000]);
  });

  it("stops retrying when cancelled", async () => {
    let calls = 0;
    const out = await resolveSessionProfile(async () => { calls++; return err(domainError("PROFILE_FETCH_FAILED", "x")); }, { sleep: noSleep, isCancelled: () => calls >= 2 });
    expect(out).toEqual({ kind: "unavailable" });
    expect(calls).toBe(2);
  });
});
