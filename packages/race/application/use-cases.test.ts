import { describe, expect, it } from "vitest";
import { domainError, err, ok } from "@9thround/shared-kernel";
import { CancelRegistrationUseCase } from "./cancel-registration";
import { ConfirmPaymentUseCase } from "./confirm-payment";
import { GetMyRegistrationUseCase } from "./get-my-registration";
import { GetPublicEventUseCase } from "./get-public-event";
import { ListRegistrationsUseCase } from "./list-registrations";
import { RefundPaymentUseCase } from "./refund-payment";
import { RegisterAthleteUseCase } from "./register-athlete";
import { StaffRegisterAthleteUseCase } from "./staff-register-athlete";
import { UpdateMyPushupStyleUseCase } from "./update-my-pushup-style";
import { WaivePaymentUseCase } from "./waive-payment";
import { FakeRaceRegistrationRepository } from "./test-helpers";
import type { MyRegistration, RegisterAthleteInput } from "../domain/registration";

const input: RegisterAthleteInput = {
  eventId: "event-1",
  eventDate: "2026-11-20",
  fullName: "  Ahmed Mohamed ",
  phone: "0100 123 4567",
  email: "  ",
  gender: "male",
  dateOfBirth: "1995-05-05",
  category: "MEN",
  pushupStyle: null,
  waiverAccepted: true,
  emergencyContact: { name: "Mother", phone: "01011112222" },
};

describe("RegisterAthleteUseCase", () => {
  it("sends a trimmed command WITHOUT the client-only eventDate", async () => {
    const repo = new FakeRaceRegistrationRepository();
    const result = await new RegisterAthleteUseCase(repo).execute(input);
    expect(result.isOk && result.value.raceNumber).toBe("N001");
    const command = repo.calls[0]!.args[0] as Record<string, unknown>;
    expect(command.fullName).toBe("Ahmed Mohamed");
    expect(command.email).toBeNull();
    expect("eventDate" in command).toBe(false);
  });
  it("never reaches the repository when the client-side check fails", async () => {
    const repo = new FakeRaceRegistrationRepository();
    const result = await new RegisterAthleteUseCase(repo).execute({ ...input, waiverAccepted: false });
    expect(result.isErr && result.error.code).toBe("RACE_WAIVER_REQUIRED");
    expect(repo.calls).toHaveLength(0);
  });
  it("passes the database's refusal through untouched", async () => {
    const repo = new FakeRaceRegistrationRepository();
    repo.registerResult = err(domainError("RACE_ALREADY_REGISTERED", "already"));
    const result = await new RegisterAthleteUseCase(repo).execute(input);
    expect(result.isErr && result.error.code).toBe("RACE_ALREADY_REGISTERED");
  });
});

describe("StaffRegisterAthleteUseCase", () => {
  it("uses the staff path with the same validation", async () => {
    const repo = new FakeRaceRegistrationRepository();
    expect((await new StaffRegisterAthleteUseCase(repo).execute({ ...input, phone: "1" })).isErr).toBe(true);
    expect(repo.calls).toHaveLength(0);
    await new StaffRegisterAthleteUseCase(repo).execute(input);
    expect(repo.calls[0]!.method).toBe("staffRegister");
  });
});

describe("GetMyRegistrationUseCase", () => {
  it("rejects an obviously invalid token without a round trip", async () => {
    const repo = new FakeRaceRegistrationRepository();
    const result = await new GetMyRegistrationUseCase(repo).execute("short");
    expect(result.isErr && result.error.code).toBe("RACE_NOT_FOUND");
    expect(repo.calls).toHaveLength(0);
  });
  it("turns 'no row' into RACE_NOT_FOUND", async () => {
    const repo = new FakeRaceRegistrationRepository();
    const result = await new GetMyRegistrationUseCase(repo).execute("x".repeat(64));
    expect(result.isErr && result.error.code).toBe("RACE_NOT_FOUND");
  });
  it("returns the registration for a known token", async () => {
    const repo = new FakeRaceRegistrationRepository();
    repo.myRegistrationResult = ok({ raceNumber: "N009" } as MyRegistration);
    const result = await new GetMyRegistrationUseCase(repo).execute(` ${"x".repeat(64)} `);
    expect(result.isOk && result.value.raceNumber).toBe("N009");
    expect(repo.calls[0]!.args[0]).toBe("x".repeat(64));
  });
});

describe("UpdateMyPushupStyleUseCase", () => {
  it("rejects a short token, forwards a valid one", async () => {
    const repo = new FakeRaceRegistrationRepository();
    const uc = new UpdateMyPushupStyleUseCase(repo);
    expect((await uc.execute({ token: "abc", style: "KNEE" })).isErr).toBe(true);
    expect((await uc.execute({ token: "x".repeat(64), style: "KNEE" })).isOk).toBe(true);
    expect(repo.calls).toHaveLength(1);
  });
});

describe("ListRegistrationsUseCase", () => {
  it("treats a blank query as 'everyone' and defaults the limit", async () => {
    const repo = new FakeRaceRegistrationRepository();
    await new ListRegistrationsUseCase(repo).execute({ eventId: "e", query: "   " });
    expect(repo.calls[0]!.args).toEqual(["e", null, 200]);
    await new ListRegistrationsUseCase(repo).execute({ eventId: "e", query: " n27 ", limit: 5 });
    expect(repo.calls[1]!.args).toEqual(["e", "n27", 5]);
  });
});

describe("ConfirmPaymentUseCase", () => {
  const base = { registrationId: "r", method: "CASH" as const, amount: null, notes: "  ", idempotencyKey: "key-1" };
  it("requires an idempotency key (double-click safety)", async () => {
    const repo = new FakeRaceRegistrationRepository();
    expect((await new ConfirmPaymentUseCase(repo).execute({ ...base, idempotencyKey: " " })).isErr).toBe(true);
    expect(repo.calls).toHaveLength(0);
  });
  it("rejects negative or non-finite amounts", async () => {
    const repo = new FakeRaceRegistrationRepository();
    expect((await new ConfirmPaymentUseCase(repo).execute({ ...base, amount: -1 })).isErr).toBe(true);
    expect((await new ConfirmPaymentUseCase(repo).execute({ ...base, amount: Number.NaN })).isErr).toBe(true);
    expect(repo.calls).toHaveLength(0);
  });
  it("normalizes blank notes to null and forwards the key", async () => {
    const repo = new FakeRaceRegistrationRepository();
    await new ConfirmPaymentUseCase(repo).execute(base);
    expect(repo.calls[0]!.args[0]).toMatchObject({ notes: null, idempotencyKey: "key-1" });
  });
});

describe.each([
  ["WaivePaymentUseCase", (r: FakeRaceRegistrationRepository) => new WaivePaymentUseCase(r), { registrationId: "r" }, "waivePayment"],
  ["RefundPaymentUseCase", (r: FakeRaceRegistrationRepository) => new RefundPaymentUseCase(r), { paymentId: "p" }, "refundPayment"],
  ["CancelRegistrationUseCase", (r: FakeRaceRegistrationRepository) => new CancelRegistrationUseCase(r), { registrationId: "r" }, "cancelRegistration"],
] as const)("%s", (_name, make, ids, method) => {
  it("requires a reason and trims it", async () => {
    const repo = new FakeRaceRegistrationRepository();
    const uc = make(repo) as unknown as { execute(i: Record<string, string>): Promise<{ isErr: boolean; error?: { code: string } }> };
    const blank = await uc.execute({ ...ids, reason: "   " });
    expect(blank.isErr && blank.error?.code).toBe("RACE_REASON_REQUIRED");
    expect(repo.calls).toHaveLength(0);
    await uc.execute({ ...ids, reason: "  sponsor  " });
    expect(repo.calls[0]).toEqual({ method, args: [Object.values(ids)[0], "sponsor"] });
  });
});

describe("GetPublicEventUseCase", () => {
  it("rejects a malformed slug without a round trip", async () => {
    const repo = new FakeRaceRegistrationRepository();
    const result = await new GetPublicEventUseCase(repo).execute("Bad Slug!");
    expect(result.isErr && result.error.code).toBe("RACE_NOT_FOUND");
    expect(repo.calls).toHaveLength(0);
  });
  it("normalizes case and turns 'no row' into RACE_NOT_FOUND", async () => {
    const repo = new FakeRaceRegistrationRepository();
    const result = await new GetPublicEventUseCase(repo).execute("  The-Ninth-2026 ");
    expect(result.isErr && result.error.code).toBe("RACE_NOT_FOUND");
    expect(repo.calls[0]).toEqual({ method: "getPublicEvent", args: ["the-ninth-2026"] });
  });
});
