import { domainError, err } from "../kernel";
import type { Result, UseCase } from "../kernel";
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

/**
 * Master Control commands. Two rules live here so every screen gets them for free:
 *  1. no free-form time, order or position is ever accepted — the server owns time and start order;
 *  2. every exceptional action needs a written reason (the database enforces it too).
 */

const REASON_REQUIRED = () => err(domainError("RACE_REASON_REQUIRED", "Write a reason — it goes in the audit log."));
const need = (id: string, what: string) => (id.trim() === "" ? err(domainError("RACE_NOT_FOUND", `Choose ${what} first.`)) : null);

export class StartEventUseCase implements UseCase<string, StartEventResult> {
  constructor(private readonly engine: RaceEngineRepository) {}
  async execute(eventId: string): Promise<Result<StartEventResult>> {
    return need(eventId, "an event") ?? this.engine.startEvent(eventId);
  }
}

export interface PauseInput {
  eventId: string;
  reason?: string;
}
/** EMERGENCY PAUSE. Never asks for a justification: `reason` is just an OPTIONAL NOTE, stored as-is (or not at all). */
export class PauseRaceUseCase implements UseCase<PauseInput, PauseResult> {
  constructor(private readonly engine: RaceEngineRepository) {}
  async execute(input: PauseInput): Promise<Result<PauseResult>> {
    const bad = need(input.eventId, "an event");
    if (bad) return bad;
    const reason = input.reason?.trim();
    return this.engine.pause(input.eventId, reason ? reason : null);
  }
}

export class ResumeRaceUseCase implements UseCase<string, ResumeResult> {
  constructor(private readonly engine: RaceEngineRepository) {}
  async execute(eventId: string): Promise<Result<ResumeResult>> {
    return need(eventId, "an event") ?? this.engine.resume(eventId);
  }
}

/** The engine tick — any staff device may send it about once a second; the server de-duplicates. */
export class AdvanceRaceUseCase implements UseCase<string, EngineTick> {
  constructor(private readonly engine: RaceEngineRepository) {}
  async execute(eventId: string): Promise<Result<EngineTick>> {
    return need(eventId, "an event") ?? this.engine.advance(eventId);
  }
}

export class GetControlStateUseCase implements UseCase<string, ControlState> {
  constructor(private readonly engine: RaceEngineRepository) {}
  async execute(eventId: string): Promise<Result<ControlState>> {
    return need(eventId, "an event") ?? this.engine.controlState(eventId);
  }
}

export interface ReasonedSlotInput {
  slotId: string;
  reason: string;
}
/** SKIP ATHLETE: the slot stays empty, nobody moves up, no other start time changes. */
export class SkipAthleteUseCase implements UseCase<ReasonedSlotInput, SkipResult> {
  constructor(private readonly engine: RaceEngineRepository) {}
  async execute(input: ReasonedSlotInput): Promise<Result<SkipResult>> {
    const bad = need(input.slotId, "an athlete");
    if (bad) return bad;
    if (input.reason.trim() === "") return REASON_REQUIRED();
    return this.engine.skipAthlete(input.slotId, input.reason.trim());
  }
}

export interface ReasonedAthleteInput {
  registrationId: string;
  reason: string;
}
export class MarkDnfUseCase implements UseCase<ReasonedAthleteInput, true> {
  constructor(private readonly engine: RaceEngineRepository) {}
  async execute(input: ReasonedAthleteInput): Promise<Result<true>> {
    const bad = need(input.registrationId, "an athlete");
    if (bad) return bad;
    if (input.reason.trim() === "") return REASON_REQUIRED();
    return this.engine.markDnf(input.registrationId, input.reason.trim());
  }
}

export interface StartNextHeatInput {
  eventId: string;
  heatNumber: number;
}
/** Only for heats configured MANUAL. The start time is computed by the server — never chosen by the operator. */
export class StartNextHeatUseCase implements UseCase<StartNextHeatInput, NextHeatResult> {
  constructor(private readonly engine: RaceEngineRepository) {}
  async execute(input: StartNextHeatInput): Promise<Result<NextHeatResult>> {
    const bad = need(input.eventId, "an event");
    if (bad) return bad;
    if (!Number.isInteger(input.heatNumber) || input.heatNumber < 1) return err(domainError("RACE_NOT_FOUND", "Choose a heat first."));
    return this.engine.startNextHeat(input.eventId, input.heatNumber);
  }
}

export interface CorrectCheckInInput {
  wrongRegistrationId: string;
  rightRegistrationId: string;
  reason: string;
}
/** Master Control only: the wrong athlete was checked in — swap in the right one, keeping the original arrival time. */
export class CorrectCheckInUseCase implements UseCase<CorrectCheckInInput, CorrectionResult> {
  constructor(private readonly engine: RaceEngineRepository) {}
  async execute(input: CorrectCheckInInput): Promise<Result<CorrectionResult>> {
    if (input.wrongRegistrationId.trim() === "" || input.rightRegistrationId.trim() === "") {
      return err(domainError("RACE_NOT_FOUND", "Choose both athletes first."));
    }
    if (input.wrongRegistrationId === input.rightRegistrationId) {
      return err(domainError("RACE_CORRECTION_SAME_ATHLETE", "Choose a different athlete."));
    }
    if (input.reason.trim() === "") return REASON_REQUIRED();
    return this.engine.correctCheckIn(input.wrongRegistrationId, input.rightRegistrationId, input.reason.trim());
  }
}

/** Event Manager only: a DNS athlete has arrived. Succeeds only if a genuinely free slot exists; otherwise NO_SLOT_AVAILABLE. */
export class OverrideDnsUseCase implements UseCase<ReasonedAthleteInput, DnsOverrideResult> {
  constructor(private readonly engine: RaceEngineRepository) {}
  async execute(input: ReasonedAthleteInput): Promise<Result<DnsOverrideResult>> {
    const bad = need(input.registrationId, "an athlete");
    if (bad) return bad;
    if (input.reason.trim() === "") return REASON_REQUIRED();
    return this.engine.overrideDns(input.registrationId, input.reason.trim());
  }
}

export interface MoveToLaterHeatInput extends ReasonedAthleteInput {
  targetHeatNumber: number;
}
/** Event Manager only: move an unslotted athlete to a LATER heat that has a safe slot. Assigned athletes are never moved. */
export class MoveToLaterHeatUseCase implements UseCase<MoveToLaterHeatInput, MoveResult> {
  constructor(private readonly engine: RaceEngineRepository) {}
  async execute(input: MoveToLaterHeatInput): Promise<Result<MoveResult>> {
    const bad = need(input.registrationId, "an athlete");
    if (bad) return bad;
    if (!Number.isInteger(input.targetHeatNumber) || input.targetHeatNumber < 1) return err(domainError("RACE_NOT_FOUND", "Choose a heat first."));
    if (input.reason.trim() === "") return REASON_REQUIRED();
    return this.engine.moveToLaterHeat(input.registrationId, input.targetHeatNumber, input.reason.trim());
  }
}

export interface CloseHeatInput {
  eventId: string;
  heatNumber: number;
  reason: string;
}
/** A heat that will never run must not block the event. Event Manager or Master Control; reason required; audited. */
export class CloseHeatWithoutStartUseCase implements UseCase<CloseHeatInput, CloseHeatResult> {
  constructor(private readonly engine: RaceEngineRepository) {}
  async execute(input: CloseHeatInput): Promise<Result<CloseHeatResult>> {
    const bad = need(input.eventId, "an event");
    if (bad) return bad;
    if (!Number.isInteger(input.heatNumber) || input.heatNumber < 1) return err(domainError("RACE_NOT_FOUND", "Choose a heat first."));
    if (input.reason.trim() === "") return REASON_REQUIRED();
    return this.engine.closeHeatWithoutStart(input.eventId, input.heatNumber, input.reason.trim());
  }
}
