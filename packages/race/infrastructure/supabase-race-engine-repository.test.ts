import { describe, expect, it } from "vitest";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { RaceControlStateJson } from "@9thround/database-types";
import { SupabaseRaceEngineRepository, toControlState, toEngineTick } from "./supabase-race-engine-repository";

const STATE: RaceControlStateJson = {
  server_time: "2026-12-21T07:05:00Z",
  event: { id: "e", name: "THE NINTH", status: "LIVE", timezone: "Africa/Cairo", first_start_offset_ms: 60000, start_interval_ms: 210000, work_ms: 180000, transition_ms: 30000, announce_lead_ms: 10000 },
  clock: { started: true, paused: false, finished: false, race_ms: 271000, version: 1, started_at: "2026-12-21T07:00:29Z", paused_at: null, pre_race: false },
  next_athlete: { registration_id: "r3", race_number: "N003", full_name: "C", category_code: "MEN", heat: 1, slot_index: 2, start_ms: 480000, starts_in_ms: 209000, announce_in_ms: 199000 },
  skippable: [{ slot_id: "s2", registration_id: "r2", race_number: "N002", full_name: "B", category_code: "MEN", heat: 1, slot_index: 1, is_overflow: false, status: "STARTED", start_ms: 270000, starts_in_ms: -1000 }],
  stations: [{ number: 1, name: "Station 01", state: "WORK", athlete: { race_number: "N002", full_name: "B", category_code: "MEN" }, window_start_ms: 270000, window_end_ms: 450000, scoring_end_ms: 480000, remaining_ms: 179000, score: null }],
  heats: [{ number: 1, status: "RUNNING", anchor_ms: 60000, planned_slots: 4, start_mode: "AUTO", roster: 4, started: 2, bound: 0, empty: 0, skipped: 0, open: 2 }],
  counts: { registered: 4, checked_in: 2, racing: 2, finished: 0, dns: 0, dnf: 0 },
  attention: { dns: [{ registration_id: "r4", race_number: "N004", full_name: "D", heat: 1, was_skipped: true }], no_slot: [{ registration_id: "r5", race_number: "N005", full_name: "E", heat: 2 }] },
};

describe("toControlState", () => {
  it("maps every section, keeping nulls", () => {
    const s = toControlState(STATE);
    expect(s.clock).toEqual({ started: true, paused: false, finished: false, raceMs: 271000, version: 1, preRace: false });
    expect(s.nextAthlete).toMatchObject({ raceNumber: "N003", startsInMs: 209000, announceInMs: 199000 });
    expect(s.skippable[0]).toMatchObject({ slotId: "s2", status: "STARTED", isOverflow: false });
    expect(s.stations[0]).toMatchObject({ state: "WORK", remainingMs: 179000, athlete: { raceNumber: "N002" } });
    expect(s.heats[0]).toMatchObject({ startMode: "AUTO", open: 2, anchorMs: 60000 });
    expect(s.counts).toEqual({ registered: 4, checkedIn: 2, racing: 2, finished: 0, dns: 0, dnf: 0 });
    expect(s.attention.dns[0]).toMatchObject({ raceNumber: "N004", wasSkipped: true });
    expect(s.attention.noSlot[0]).toMatchObject({ raceNumber: "N005", heat: 2 });
  });
  it("handles a race that has not started", () => {
    const s = toControlState({ ...STATE, clock: { ...STATE.clock, started: false, race_ms: null, started_at: null }, next_athlete: null, skippable: [], stations: [] });
    expect(s.clock.raceMs).toBeNull();
    expect(s.nextAthlete).toBeNull();
  });
});

describe("toEngineTick", () => {
  it("recognises a busy answer", () => {
    expect(toEngineTick({ busy: true })).toMatchObject({ busy: true, advanced: false, raceMs: null, athletesStarted: 0 });
  });
  it("reads a real tick", () => {
    expect(toEngineTick({ advanced: true, race_ms: 5000, athletes_started: 1, event_finished: false })).toMatchObject({ busy: false, advanced: true, raceMs: 5000, athletesStarted: 1 });
  });
});

describe("SupabaseRaceEngineRepository", () => {
  function clientReturning(response: { data: unknown; error: { code?: string; message: string } | null }) {
    const calls: { fn: string; args: unknown }[] = [];
    const client = {
      rpc(fn: string, args: unknown) {
        calls.push({ fn, args });
        const p = Promise.resolve(response);
        return Object.assign(p, { single: () => Promise.resolve({ data: Array.isArray(response.data) ? (response.data as unknown[])[0] : response.data, error: response.error }) });
      },
    } as unknown as TypedSupabaseClient;
    return { client, calls };
  }
  it("calls START EVENT with only the event id", async () => {
    const { client, calls } = clientReturning({ data: [{ started_at: "t", first_start_ms: 60000, heats_anchored: 6 }], error: null });
    const r = await new SupabaseRaceEngineRepository(client).startEvent("ev");
    expect(calls).toEqual([{ fn: "race_start_event", args: { p_event_id: "ev" } }]);
    expect(r).toEqual({ isOk: true, isErr: false, value: { startedAt: "t", firstStartMs: 60000, heatsAnchored: 6 } });
  });
  it("turns the database's refusal into friendly wording", async () => {
    const { client } = clientReturning({ data: null, error: { code: "23514", message: "RACE_ALREADY_STARTED: START EVENT can only be pressed once" } });
    const r = await new SupabaseRaceEngineRepository(client).startEvent("ev");
    expect(r.isErr && r.error.code).toBe("RACE_ALREADY_STARTED");
    expect(r.isErr && r.error.message).toContain("only be pressed once");
  });
  it("maps the DNS override outcome, including NO_SLOT_AVAILABLE", async () => {
    const { client } = clientReturning({ data: [{ outcome: "NO_SLOT_AVAILABLE", queue_position: null, heat_number: 1, slot_index: null }], error: null });
    const r = await new SupabaseRaceEngineRepository(client).overrideDns("r", "arrived");
    expect(r).toEqual({ isOk: true, isErr: false, value: { outcome: "NO_SLOT_AVAILABLE", queuePosition: null, heatNumber: 1, slotIndex: null } });
  });
  it("sends a skip with the slot and reason", async () => {
    const { client, calls } = clientReturning({ data: [{ heat_number: 1, slot_index: 2, race_number: "N003" }], error: null });
    await new SupabaseRaceEngineRepository(client).skipAthlete("slot", "why");
    expect(calls[0]).toEqual({ fn: "race_skip_athlete", args: { p_slot_id: "slot", p_reason: "why" } });
  });
  it("reports a tick as busy", async () => {
    const { client } = clientReturning({ data: { busy: true }, error: null });
    const r = await new SupabaseRaceEngineRepository(client).advance("e");
    expect(r).toMatchObject({ isOk: true, value: { busy: true } });
  });
});
