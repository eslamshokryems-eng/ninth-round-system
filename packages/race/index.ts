import type { RaceSupabaseClient } from "./infrastructure/race-client";
import { RegisterAthleteUseCase } from "./application/register-athlete";
import { StaffRegisterAthleteUseCase } from "./application/staff-register-athlete";
import { CheckInAthleteUseCase } from "./application/check-in-athlete";
import { GetQueueUseCase } from "./application/get-queue";
import { GetPublicEventUseCase } from "./application/get-public-event";
import { GetMyRegistrationUseCase } from "./application/get-my-registration";
import { UpdateMyPushupStyleUseCase } from "./application/update-my-pushup-style";
import { ListRegistrationsUseCase } from "./application/list-registrations";
import { ConfirmPaymentUseCase } from "./application/confirm-payment";
import { WaivePaymentUseCase } from "./application/waive-payment";
import { RefundPaymentUseCase } from "./application/refund-payment";
import { CancelRegistrationUseCase } from "./application/cancel-registration";
import {
  AdvanceRaceUseCase,
  CloseHeatWithoutStartUseCase,
  CorrectCheckInUseCase,
  GetControlStateUseCase,
  MarkDnfUseCase,
  MoveToLaterHeatUseCase,
  OverrideDnsUseCase,
  PauseRaceUseCase,
  ResumeRaceUseCase,
  SkipAthleteUseCase,
  StartEventUseCase,
  StartNextHeatUseCase,
} from "./application/engine-use-cases";
import { SupabaseRaceRegistrationRepository } from "./infrastructure/supabase-race-registration-repository";
import { SupabaseRaceEngineRepository } from "./infrastructure/supabase-race-engine-repository";

export type { Result, DomainError, UseCase } from "./kernel";
export { createRaceSupabaseClient } from "./infrastructure/race-client";
export type { RaceSupabaseClient, RaceClientParams } from "./infrastructure/race-client";
export * from "./domain/eligibility";
export * from "./domain/phone";
export * from "./domain/race-number";
export * from "./domain/race-error";
export * from "./domain/registration";
export * from "./domain/engine";
export * from "./domain/timeline";
export * from "./domain/race-clock";
export type { RaceEngineRepository } from "./domain/race-engine-repository";
export * from "./application/engine-use-cases";
export { SupabaseRaceEngineRepository } from "./infrastructure/supabase-race-engine-repository";
export { validateRegistration } from "./domain/registration-validation";
export type { RaceRegistrationRepository } from "./domain/race-registration-repository";
export { RegisterAthleteUseCase } from "./application/register-athlete";
export { StaffRegisterAthleteUseCase } from "./application/staff-register-athlete";
export { CheckInAthleteUseCase } from "./application/check-in-athlete";
export { GetQueueUseCase } from "./application/get-queue";
export { GetPublicEventUseCase } from "./application/get-public-event";
export { GetMyRegistrationUseCase } from "./application/get-my-registration";
export { UpdateMyPushupStyleUseCase } from "./application/update-my-pushup-style";
export { ListRegistrationsUseCase } from "./application/list-registrations";
export { ConfirmPaymentUseCase } from "./application/confirm-payment";
export { WaivePaymentUseCase } from "./application/waive-payment";
export { RefundPaymentUseCase } from "./application/refund-payment";
export { CancelRegistrationUseCase } from "./application/cancel-registration";
export { SupabaseRaceRegistrationRepository } from "./infrastructure/supabase-race-registration-repository";

/**
 * THE NINTH race system's composition root (registration, payments, check-in, engine).
 * Later phases (judging, scoring, results) extend this module.
 */
export function createRaceModule(client: RaceSupabaseClient) {
  const registrations = new SupabaseRaceRegistrationRepository(client);
  const engine = new SupabaseRaceEngineRepository(client);
  return {
    startEvent: new StartEventUseCase(engine),
    pauseRace: new PauseRaceUseCase(engine),
    resumeRace: new ResumeRaceUseCase(engine),
    advanceRace: new AdvanceRaceUseCase(engine),
    getControlState: new GetControlStateUseCase(engine),
    skipAthlete: new SkipAthleteUseCase(engine),
    markDnf: new MarkDnfUseCase(engine),
    startNextHeat: new StartNextHeatUseCase(engine),
    closeHeatWithoutStart: new CloseHeatWithoutStartUseCase(engine),
    correctCheckIn: new CorrectCheckInUseCase(engine),
    overrideDns: new OverrideDnsUseCase(engine),
    moveToLaterHeat: new MoveToLaterHeatUseCase(engine),
    checkInAthlete: new CheckInAthleteUseCase(registrations),
    getQueue: new GetQueueUseCase(registrations),
    getPublicEvent: new GetPublicEventUseCase(registrations),
    registerAthlete: new RegisterAthleteUseCase(registrations),
    staffRegisterAthlete: new StaffRegisterAthleteUseCase(registrations),
    getMyRegistration: new GetMyRegistrationUseCase(registrations),
    updateMyPushupStyle: new UpdateMyPushupStyleUseCase(registrations),
    listRegistrations: new ListRegistrationsUseCase(registrations),
    confirmPayment: new ConfirmPaymentUseCase(registrations),
    waivePayment: new WaivePaymentUseCase(registrations),
    refundPayment: new RefundPaymentUseCase(registrations),
    cancelRegistration: new CancelRegistrationUseCase(registrations),
  };
}
