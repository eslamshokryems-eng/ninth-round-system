import { ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { PushupStyle } from "../domain/eligibility";
import type { RaceRegistrationRepository } from "../domain/race-registration-repository";
import type {
  CheckInResult,
  ConfirmPaymentInput,
  MyRegistration,
  PublicRaceEvent,
  QueueEntry,
  RegisterAthleteCommand,
  RegistrationConfirmation,
  StaffRegistrationRow,
} from "../domain/registration";

export const CONFIRMATION: RegistrationConfirmation = {
  registrationId: "reg-1",
  raceNumber: "N001",
  accessToken: "t".repeat(64),
  status: "CONFIRMED",
  amountDue: 0,
  currency: "EGP",
};

/** Records every call so tests can assert exactly what reached the repository. */
export class FakeRaceRegistrationRepository implements RaceRegistrationRepository {
  calls: { method: string; args: unknown[] }[] = [];
  registerResult: Result<RegistrationConfirmation> = ok(CONFIRMATION);
  myRegistrationResult: Result<MyRegistration | null> = ok(null);
  private record<T>(method: string, args: unknown[], result: T): T {
    this.calls.push({ method, args });
    return result;
  }
  getPublicEvent(slug: string) {
    return Promise.resolve(this.record("getPublicEvent", [slug], ok(null) as Result<PublicRaceEvent | null>));
  }
  register(command: RegisterAthleteCommand) {
    return Promise.resolve(this.record("register", [command], this.registerResult));
  }
  staffRegister(command: RegisterAthleteCommand) {
    return Promise.resolve(this.record("staffRegister", [command], this.registerResult));
  }
  getMyRegistration(token: string) {
    return Promise.resolve(this.record("getMyRegistration", [token], this.myRegistrationResult));
  }
  updateMyPushupStyle(token: string, style: PushupStyle) {
    return Promise.resolve(this.record("updateMyPushupStyle", [token, style], ok(style) as Result<PushupStyle>));
  }
  list(eventId: string, query: string | null, limit: number) {
    return Promise.resolve(this.record("list", [eventId, query, limit], ok([]) as Result<StaffRegistrationRow[]>));
  }
  confirmPayment(input: ConfirmPaymentInput) {
    return Promise.resolve(this.record("confirmPayment", [input], ok("pay-1") as Result<string>));
  }
  waivePayment(registrationId: string, reason: string) {
    return Promise.resolve(this.record("waivePayment", [registrationId, reason], ok(true as const) as Result<true>));
  }
  refundPayment(paymentId: string, reason: string) {
    return Promise.resolve(this.record("refundPayment", [paymentId, reason], ok(true as const) as Result<true>));
  }
  cancelRegistration(registrationId: string, reason: string) {
    return Promise.resolve(this.record("cancelRegistration", [registrationId, reason], ok(true as const) as Result<true>));
  }
  checkIn(registrationId: string) {
    const result: CheckInResult = { checkInId: "c1", checkedInAt: "2026-11-20T06:00:00Z", kind: "ON_TIME", queuePosition: 1, heatNumber: 1, alreadyCheckedIn: false };
    return Promise.resolve(this.record("checkIn", [registrationId], ok(result) as Result<CheckInResult>));
  }
  queue(eventId: string, heatNumber: number | null) {
    return Promise.resolve(this.record("queue", [eventId, heatNumber], ok([]) as Result<QueueEntry[]>));
  }
}
