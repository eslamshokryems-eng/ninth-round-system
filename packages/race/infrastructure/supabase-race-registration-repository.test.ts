import { describe, expect, it } from "vitest";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import { SupabaseRaceRegistrationRepository, toConfirmation, toMyRegistration, toRaceError, toStaffRow } from "./supabase-race-registration-repository";

describe("toRaceError", () => {
  it("uses the database's RACE_* code and friendly wording", () => {
    const e = toRaceError({ code: "P0001", message: "RACE_ALREADY_REGISTERED: this athlete is already registered for the event" });
    expect(e.code).toBe("RACE_ALREADY_REGISTERED");
    expect(e.message).toBe("This athlete is already registered for the event.");
  });
  it("maps a missing-privilege error to RACE_FORBIDDEN", () => {
    expect(toRaceError({ code: "42501", message: "permission denied for function race_confirm_payment" }).code).toBe("RACE_FORBIDDEN");
  });
  it("hides unknown database errors behind a generic message", () => {
    const e = toRaceError({ code: "XX000", message: "internal: relation \"race_secret\" exploded" });
    expect(e.code).toBe("RACE_REQUEST_FAILED");
    expect(e.message).not.toContain("race_secret");
  });
});

describe("row mappers", () => {
  it("maps confirmation numerics", () => {
    expect(toConfirmation({ registration_id: "r", race_number: "N005", access_token: "t", status: "PENDING_PAYMENT", amount_due: "750.00" as unknown as number, currency: "EGP" }))
      .toEqual({ registrationId: "r", raceNumber: "N005", accessToken: "t", status: "PENDING_PAYMENT", amountDue: 750, currency: "EGP" });
  });
  it("maps the athlete view, keeping nulls", () => {
    const view = toMyRegistration({
      registration_id: "r", race_number: "N001", full_name: "A", category_code: "MEN", category_name: "Men", status: "CONFIRMED",
      race_status: "REGISTERED", pushup_style: "STANDARD", pushup_style_locked: false, heat_number: null, heat_start_at: null,
      checkin_closes_at: null, event_name: "THE NINTH", event_slug: "s", event_date: "2026-11-20", venue: null, timezone: "Africa/Cairo",
      instructions: null, payment_status: null, payment_amount: null, currency: "EGP",
    });
    expect(view.heatNumber).toBeNull();
    expect(view.paymentAmount).toBeNull();
    expect(view.raceNumber).toBe("N001");
  });
  it("maps a staff row", () => {
    const row = toStaffRow({
      registration_id: "r", race_number: "N002", full_name: "B", phone: "0100", email: null, gender: "female", category_code: "WOMEN",
      heat_id: null, heat_number: null, status: "PENDING_PAYMENT", race_status: "REGISTERED", pushup_style: "KNEE", payment_id: "p",
      payment_status: "PENDING", payment_amount: 750, payment_method: null, paid_at: null, created_at: "2026-09-29T10:00:00Z",
    });
    expect(row.paymentAmount).toBe(750);
    expect(row.categoryCode).toBe("WOMEN");
  });
});

describe("SupabaseRaceRegistrationRepository", () => {
  function clientReturning(response: { data: unknown; error: { code?: string; message: string } | null }) {
    const calls: { fn: string; args: unknown }[] = [];
    const terminal = { single: () => Promise.resolve(response), maybeSingle: () => Promise.resolve(response), then: (r: (v: unknown) => unknown) => r(response) };
    const client = { rpc: (fn: string, args: unknown) => { calls.push({ fn, args }); return terminal; } };
    return { client: client as unknown as TypedSupabaseClient, calls };
  }
  it("calls race_register_athlete with the exact argument names and maps errors", async () => {
    const { client, calls } = clientReturning({ data: null, error: { code: "P0001", message: "RACE_WAIVER_REQUIRED: x" } });
    const result = await new SupabaseRaceRegistrationRepository(client).register({
      eventId: "e", fullName: "A B", phone: "0100", email: null, gender: "male", dateOfBirth: "1990-01-01", category: "MEN",
      pushupStyle: null, waiverAccepted: true, emergencyContact: { name: "M", phone: "0101" },
    });
    expect(result.isErr && result.error.code).toBe("RACE_WAIVER_REQUIRED");
    expect(calls[0]).toEqual({ fn: "race_register_athlete", args: {
      p_event_id: "e", p_full_name: "A B", p_phone: "0100", p_email: null, p_gender: "male", p_date_of_birth: "1990-01-01",
      p_category: "MEN", p_pushup_style: null, p_waiver_accepted: true, p_emergency_contact: { name: "M", phone: "0101" } } });
  });
  it("returns null (not an error) when a token matches no registration", async () => {
    const { client } = clientReturning({ data: null, error: null });
    const result = await new SupabaseRaceRegistrationRepository(client).getMyRegistration("x".repeat(64));
    expect(result.isOk && result.value).toBeNull();
  });
  it("sends the idempotency key with a payment confirmation", async () => {
    const { client, calls } = clientReturning({ data: "pay-1", error: null });
    const result = await new SupabaseRaceRegistrationRepository(client).confirmPayment({ registrationId: "r", method: "CASH", amount: null, notes: null, idempotencyKey: "k" });
    expect(result.isOk && result.value).toBe("pay-1");
    expect(calls[0]).toEqual({ fn: "race_confirm_payment", args: { p_registration_id: "r", p_method: "CASH", p_amount: null, p_notes: null, p_idempotency_key: "k" } });
  });
});
