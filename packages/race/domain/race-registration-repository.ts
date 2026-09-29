import type { Result } from "@9thround/shared-kernel";
import type { PushupStyle } from "./eligibility";
import type {
  CheckInResult,
  ConfirmPaymentInput,
  MyRegistration,
  PublicRaceEvent,
  QueueEntry,
  RegisterAthleteCommand,
  RegistrationConfirmation,
  StaffRegistrationRow,
} from "./registration";

/** Port for everything Phase 4 does. The infrastructure layer is the only place that knows the SQL RPC names. */
export interface RaceRegistrationRepository {
  getPublicEvent(slug: string): Promise<Result<PublicRaceEvent | null>>;
  register(command: RegisterAthleteCommand): Promise<Result<RegistrationConfirmation>>;
  staffRegister(command: RegisterAthleteCommand): Promise<Result<RegistrationConfirmation>>;
  getMyRegistration(token: string): Promise<Result<MyRegistration | null>>;
  updateMyPushupStyle(token: string, style: PushupStyle): Promise<Result<PushupStyle>>;
  list(eventId: string, query: string | null, limit: number): Promise<Result<StaffRegistrationRow[]>>;
  confirmPayment(input: ConfirmPaymentInput): Promise<Result<string>>;
  waivePayment(registrationId: string, reason: string): Promise<Result<true>>;
  refundPayment(paymentId: string, reason: string): Promise<Result<true>>;
  cancelRegistration(registrationId: string, reason: string): Promise<Result<true>>;
  checkIn(registrationId: string): Promise<Result<CheckInResult>>;
  queue(eventId: string, heatNumber: number | null): Promise<Result<QueueEntry[]>>;
}
