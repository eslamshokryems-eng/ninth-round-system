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
import { GetStationViewUseCase, RecordActionUseCase, ReviewActionUseCase } from "./application/judge-use-cases";
import { SupabaseRaceJudgeRepository } from "./infrastructure/supabase-race-judge-repository";
import { GetStationScreenUseCase } from "./application/station-screen-use-case";
import { ComputeRankingsUseCase, CorrectResultUseCase, GetAthleteResultsUseCase, GetLeaderboardUseCase, PublishResultsUseCase } from "./application/results-use-cases";
import { SupabaseRaceResultsRepository } from "./infrastructure/supabase-race-results-repository";
import { CorrectRowingUseCase, GetEvidenceHistoryUseCase, GetEvidenceImageUseCase, GetRowingViewUseCase, ReviewEvidenceUseCase } from "./application/rowing-use-cases";
import { SupabaseRaceRowingRepository } from "./infrastructure/supabase-race-rowing-repository";
import { SupabaseRaceScreenRepository } from "./infrastructure/supabase-race-screen-repository";
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
export * from "./domain/station-screen";
export * from "./domain/ranking";
export * from "./domain/rowing";
export * from "./domain/evidence-queue";
export type * from "./domain/race-rowing-repository";
export * from "./application/rowing-use-cases";
export { SupabaseRaceRowingRepository } from "./infrastructure/supabase-race-rowing-repository";
export type { RaceResultsRepository } from "./domain/race-results-repository";
export * from "./application/results-use-cases";
export { SupabaseRaceResultsRepository } from "./infrastructure/supabase-race-results-repository";
export type { RaceScreenRepository } from "./domain/race-screen-repository";
export * from "./application/station-screen-use-case";
export { SupabaseRaceScreenRepository } from "./infrastructure/supabase-race-screen-repository";
export * from "./domain/judge";
export * from "./domain/action-queue";
export type { RaceJudgeRepository } from "./domain/race-judge-repository";
export * from "./application/judge-use-cases";
export { SupabaseRaceJudgeRepository } from "./infrastructure/supabase-race-judge-repository";
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
  const judge = new SupabaseRaceJudgeRepository(client);
  const results = new SupabaseRaceResultsRepository(client);
  const rowing = new SupabaseRaceRowingRepository(client);
  return {
    rowingRepository: rowing,
    getRowingView: new GetRowingViewUseCase(rowing),
    getEvidenceHistory: new GetEvidenceHistoryUseCase(rowing),
    getEvidenceImage: new GetEvidenceImageUseCase(rowing),
    reviewEvidence: new ReviewEvidenceUseCase(rowing),
    correctRowing: new CorrectRowingUseCase(rowing),
    getLeaderboard: new GetLeaderboardUseCase(results),
    computeRankings: new ComputeRankingsUseCase(results),
    publishResults: new PublishResultsUseCase(results),
    getAthleteResults: new GetAthleteResultsUseCase(results),
    correctResult: new CorrectResultUseCase(results),
    getStationScreen: new GetStationScreenUseCase(new SupabaseRaceScreenRepository(client)),
    recordAction: new RecordActionUseCase(judge),
    reviewAction: new ReviewActionUseCase(judge),
    getStationView: new GetStationViewUseCase(judge),
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
