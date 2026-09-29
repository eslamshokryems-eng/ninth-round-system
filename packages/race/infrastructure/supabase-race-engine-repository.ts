import { err, ok } from "../kernel";
import type { Result } from "../kernel";
import type { RaceSupabaseClient } from "./race-client";
import type {
  RaceAdvanceJson,
  RaceCloseHeatRow,
  RaceControlStateJson,
  RaceCorrectionRow,
  RaceDnsOverrideRow,
  RaceMoveRow,
  RaceNextHeatRow,
  RacePauseRow,
  RaceResumeRow,
  RaceSkipRow,
  RaceStartEventRow,
} from "./race-database";
import type {
  CloseHeatResult,
  ControlState,
  CorrectionResult,
  DnsOverrideResult,
  EngineTick,
  MoveResult,
  NextHeatResult,
  PauseResult,
  ResumeResult,
  SkipResult,
  StartEventResult,
} from "../domain/engine";
import type { RaceEngineRepository } from "../domain/race-engine-repository";
import { toRaceError } from "./supabase-race-registration-repository";

export function toControlState(j: RaceControlStateJson): ControlState {
  return {
    serverTime: j.server_time,
    event: {
      id: j.event.id,
      name: j.event.name,
      status: j.event.status,
      timezone: j.event.timezone,
      firstStartOffsetMs: j.event.first_start_offset_ms,
      startIntervalMs: j.event.start_interval_ms,
      workMs: j.event.work_ms,
      transitionMs: j.event.transition_ms,
      announceLeadMs: j.event.announce_lead_ms,
    },
    clock: { started: j.clock.started, paused: j.clock.paused, finished: j.clock.finished, raceMs: j.clock.race_ms, version: j.clock.version, preRace: j.clock.pre_race },
    nextAthlete: j.next_athlete
      ? {
          registrationId: j.next_athlete.registration_id,
          raceNumber: j.next_athlete.race_number,
          fullName: j.next_athlete.full_name,
          categoryCode: j.next_athlete.category_code,
          heat: j.next_athlete.heat,
          slotIndex: j.next_athlete.slot_index,
          startMs: j.next_athlete.start_ms,
          startsInMs: j.next_athlete.starts_in_ms,
          announceInMs: j.next_athlete.announce_in_ms,
        }
      : null,
    skippable: j.skippable.map((s) => ({
      slotId: s.slot_id,
      registrationId: s.registration_id,
      raceNumber: s.race_number,
      fullName: s.full_name,
      categoryCode: s.category_code,
      heat: s.heat,
      slotIndex: s.slot_index,
      isOverflow: s.is_overflow,
      status: s.status,
      startMs: s.start_ms,
      startsInMs: s.starts_in_ms,
    })),
    stations: j.stations.map((s) => ({
      number: s.number,
      name: s.name,
      state: s.state,
      athlete: s.athlete ? { raceNumber: s.athlete.race_number, fullName: s.athlete.full_name, categoryCode: s.athlete.category_code } : null,
      windowStartMs: s.window_start_ms,
      windowEndMs: s.window_end_ms,
      scoringEndMs: s.scoring_end_ms,
      remainingMs: s.remaining_ms,
    })),
    heats: j.heats.map((h) => ({
      number: h.number,
      status: h.status,
      anchorMs: h.anchor_ms,
      plannedSlots: h.planned_slots,
      startMode: h.start_mode,
      roster: h.roster,
      started: h.started,
      bound: h.bound,
      empty: h.empty,
      skipped: h.skipped,
      open: h.open,
    })),
    counts: {
      registered: j.counts.registered,
      checkedIn: j.counts.checked_in,
      racing: j.counts.racing,
      finished: j.counts.finished,
      dns: j.counts.dns,
      dnf: j.counts.dnf,
    },
    attention: {
      dns: j.attention.dns.map((a) => ({ registrationId: a.registration_id, raceNumber: a.race_number, fullName: a.full_name, heat: a.heat, wasSkipped: a.was_skipped })),
      noSlot: j.attention.no_slot.map((a) => ({ registrationId: a.registration_id, raceNumber: a.race_number, fullName: a.full_name, heat: a.heat })),
    },
  };
}

export function toEngineTick(j: RaceAdvanceJson): EngineTick {
  return {
    busy: j.busy === true,
    advanced: j.advanced === true,
    raceMs: j.race_ms ?? null,
    athletesStarted: j.athletes_started ?? 0,
    athletesFinished: j.athletes_finished ?? 0,
    eventFinished: j.event_finished === true,
  };
}

export class SupabaseRaceEngineRepository implements RaceEngineRepository {
  constructor(private readonly client: RaceSupabaseClient) {}

  async startEvent(eventId: string): Promise<Result<StartEventResult>> {
    const { data, error } = await this.client.rpc("race_start_event", { p_event_id: eventId }).single();
    if (error) return err(toRaceError(error));
    const row = data as RaceStartEventRow;
    return ok({ startedAt: row.started_at, firstStartMs: row.first_start_ms, heatsAnchored: row.heats_anchored });
  }

  async pause(eventId: string, reason: string | null): Promise<Result<PauseResult>> {
    const { data, error } = await this.client.rpc("race_pause", { p_event_id: eventId, p_reason: reason }).single();
    if (error) return err(toRaceError(error));
    const row = data as RacePauseRow;
    return ok({ pausedAt: row.paused_at, pausedRaceMs: row.paused_race_ms });
  }

  async resume(eventId: string): Promise<Result<ResumeResult>> {
    const { data, error } = await this.client.rpc("race_resume", { p_event_id: eventId }).single();
    if (error) return err(toRaceError(error));
    const row = data as RaceResumeRow;
    return ok({ resumedAt: row.resumed_at, pausedMs: row.paused_ms, raceMs: row.race_ms });
  }

  async advance(eventId: string): Promise<Result<EngineTick>> {
    const { data, error } = await this.client.rpc("race_advance", { p_event_id: eventId });
    if (error) return err(toRaceError(error));
    return ok(toEngineTick(data as RaceAdvanceJson));
  }

  async controlState(eventId: string): Promise<Result<ControlState>> {
    const { data, error } = await this.client.rpc("race_control_state", { p_event_id: eventId });
    if (error) return err(toRaceError(error));
    return ok(toControlState(data as RaceControlStateJson));
  }

  async skipAthlete(slotId: string, reason: string): Promise<Result<SkipResult>> {
    const { data, error } = await this.client.rpc("race_skip_athlete", { p_slot_id: slotId, p_reason: reason }).single();
    if (error) return err(toRaceError(error));
    const row = data as RaceSkipRow;
    return ok({ heatNumber: row.heat_number, slotIndex: row.slot_index, raceNumber: row.race_number });
  }

  async markDnf(registrationId: string, reason: string): Promise<Result<true>> {
    const { error } = await this.client.rpc("race_mark_dnf", { p_registration_id: registrationId, p_reason: reason });
    return error ? err(toRaceError(error)) : ok(true);
  }

  async startNextHeat(eventId: string, heatNumber: number): Promise<Result<NextHeatResult>> {
    const { data, error } = await this.client.rpc("race_start_next_heat", { p_event_id: eventId, p_heat_number: heatNumber }).single();
    if (error) return err(toRaceError(error));
    const row = data as RaceNextHeatRow;
    return ok({ heatNumber: row.heat_number, anchorMs: row.anchor_race_ms });
  }

  async closeHeatWithoutStart(eventId: string, heatNumber: number, reason: string): Promise<Result<CloseHeatResult>> {
    const { data, error } = await this.client
      .rpc("race_close_heat_without_start", { p_event_id: eventId, p_heat_number: heatNumber, p_reason: reason })
      .single();
    if (error) return err(toRaceError(error));
    const row = data as RaceCloseHeatRow;
    return ok({ heatNumber: row.heat_number, athletesDns: row.athletes_dns, slotsEmptied: row.slots_emptied, nextHeatAnchored: row.next_heat_anchored });
  }

  async correctCheckIn(oldRegistrationId: string, newRegistrationId: string, reason: string): Promise<Result<CorrectionResult>> {
    const { data, error } = await this.client
      .rpc("race_correct_check_in", { p_old_registration_id: oldRegistrationId, p_new_registration_id: newRegistrationId, p_reason: reason })
      .single();
    if (error) return err(toRaceError(error));
    const row = data as RaceCorrectionRow;
    return ok({
      correctionId: row.correction_id,
      newCheckInId: row.new_check_in_id,
      queuePosition: row.queue_position,
      heatNumber: row.heat_number,
      slotRebound: row.slot_rebound,
    });
  }

  async overrideDns(registrationId: string, reason: string): Promise<Result<DnsOverrideResult>> {
    const { data, error } = await this.client.rpc("race_override_dns", { p_registration_id: registrationId, p_reason: reason }).single();
    if (error) return err(toRaceError(error));
    const row = data as RaceDnsOverrideRow;
    return ok({ outcome: row.outcome, queuePosition: row.queue_position, heatNumber: row.heat_number, slotIndex: row.slot_index });
  }

  async moveToLaterHeat(registrationId: string, targetHeatNumber: number, reason: string): Promise<Result<MoveResult>> {
    const { data, error } = await this.client
      .rpc("race_move_athlete_later_heat", { p_registration_id: registrationId, p_target_heat_number: targetHeatNumber, p_reason: reason })
      .single();
    if (error) return err(toRaceError(error));
    const row = data as RaceMoveRow;
    return ok({ heatNumber: row.heat_number, queuePosition: row.queue_position, slotIndex: row.slot_index });
  }
}
