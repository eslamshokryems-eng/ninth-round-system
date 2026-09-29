import type { Result } from "@9thround/shared-kernel";
import type {
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
} from "./engine";

/** Port for the race engine and Master Control (Phase 6). Only the infrastructure layer knows the RPC names. */
export interface RaceEngineRepository {
  startEvent(eventId: string): Promise<Result<StartEventResult>>;
  pause(eventId: string, reason: string | null): Promise<Result<PauseResult>>;
  resume(eventId: string): Promise<Result<ResumeResult>>;
  advance(eventId: string): Promise<Result<EngineTick>>;
  controlState(eventId: string): Promise<Result<ControlState>>;
  skipAthlete(slotId: string, reason: string): Promise<Result<SkipResult>>;
  markDnf(registrationId: string, reason: string): Promise<Result<true>>;
  startNextHeat(eventId: string, heatNumber: number): Promise<Result<NextHeatResult>>;
  correctCheckIn(oldRegistrationId: string, newRegistrationId: string, reason: string): Promise<Result<CorrectionResult>>;
  overrideDns(registrationId: string, reason: string): Promise<Result<DnsOverrideResult>>;
  moveToLaterHeat(registrationId: string, targetHeatNumber: number, reason: string): Promise<Result<MoveResult>>;
}
