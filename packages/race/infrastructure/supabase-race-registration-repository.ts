import { domainError, err, ok } from "@9thround/shared-kernel";
import type { DomainError, Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type {
  RaceMyRegistrationRow,
  RacePublicEventRow,
  RaceRegistrationConfirmationRow,
  RaceStaffRegistrationRow,
} from "@9thround/database-types";
import type { PushupStyle } from "../domain/eligibility";
import { describeRaceError, parseRaceErrorCode } from "../domain/race-error";
import type { RaceRegistrationRepository } from "../domain/race-registration-repository";
import type {
  ConfirmPaymentInput,
  MyRegistration,
  PublicRaceEvent,
  RegisterAthleteCommand,
  RegistrationConfirmation,
  StaffRegistrationRow,
} from "../domain/registration";

/** Postgres insufficient_privilege (a missing EXECUTE grant or an RLS refusal). */
const INSUFFICIENT_PRIVILEGE = "42501";

/** Maps a PostgREST error to a domain error using the database's RACE_* codes. Exported for tests. */
export function toRaceError(error: { code?: string; message: string }): DomainError {
  const code = parseRaceErrorCode(error.message);
  if (code) return domainError(code, describeRaceError(code, error.message));
  if (error.code === INSUFFICIENT_PRIVILEGE) {
    return domainError("RACE_FORBIDDEN", describeRaceError("RACE_FORBIDDEN"));
  }
  return domainError("RACE_REQUEST_FAILED", "Something went wrong. Check your connection and try again.");
}

export function toConfirmation(row: RaceRegistrationConfirmationRow): RegistrationConfirmation {
  return {
    registrationId: row.registration_id,
    raceNumber: row.race_number,
    accessToken: row.access_token,
    status: row.status,
    amountDue: Number(row.amount_due),
    currency: row.currency,
  };
}

export function toMyRegistration(row: RaceMyRegistrationRow): MyRegistration {
  return {
    registrationId: row.registration_id,
    raceNumber: row.race_number,
    fullName: row.full_name,
    categoryCode: row.category_code,
    categoryName: row.category_name,
    status: row.status,
    raceStatus: row.race_status,
    pushupStyle: row.pushup_style,
    pushupStyleLocked: row.pushup_style_locked,
    heatNumber: row.heat_number,
    heatStartAt: row.heat_start_at,
    checkinClosesAt: row.checkin_closes_at,
    eventName: row.event_name,
    eventSlug: row.event_slug,
    eventDate: row.event_date,
    venue: row.venue,
    timezone: row.timezone,
    instructions: row.instructions,
    paymentStatus: row.payment_status,
    paymentAmount: row.payment_amount === null ? null : Number(row.payment_amount),
    currency: row.currency,
  };
}

export function toPublicEvent(row: RacePublicEventRow): PublicRaceEvent {
  return {
    eventId: row.event_id,
    slug: row.slug,
    name: row.name,
    eventDate: row.event_date,
    venue: row.venue,
    timezone: row.timezone,
    status: row.status,
    registrationOpen: row.registration_open,
    registrationFee: Number(row.registration_fee),
    currency: row.currency,
    instructions: row.instructions,
    plannedStartAt: row.planned_start_at,
    heatsLocked: row.heats_locked,
  };
}

export function toStaffRow(row: RaceStaffRegistrationRow): StaffRegistrationRow {
  return {
    registrationId: row.registration_id,
    raceNumber: row.race_number,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email,
    gender: row.gender,
    categoryCode: row.category_code,
    heatId: row.heat_id,
    heatNumber: row.heat_number,
    status: row.status,
    raceStatus: row.race_status,
    pushupStyle: row.pushup_style,
    paymentId: row.payment_id,
    paymentStatus: row.payment_status,
    paymentAmount: row.payment_amount === null ? null : Number(row.payment_amount),
    paymentMethod: row.payment_method,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

function registerArgs(command: RegisterAthleteCommand) {
  return {
    p_event_id: command.eventId,
    p_full_name: command.fullName,
    p_phone: command.phone,
    p_email: command.email,
    p_gender: command.gender,
    p_date_of_birth: command.dateOfBirth,
    p_category: command.category,
    p_pushup_style: command.pushupStyle,
    p_waiver_accepted: command.waiverAccepted,
    p_emergency_contact: command.emergencyContact,
  };
}

export class SupabaseRaceRegistrationRepository implements RaceRegistrationRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getPublicEvent(slug: string): Promise<Result<PublicRaceEvent | null>> {
    const { data, error } = await this.client.rpc("race_get_public_event", { p_slug: slug }).maybeSingle();
    if (error) return err(toRaceError(error));
    return ok(data ? toPublicEvent(data as RacePublicEventRow) : null);
  }

  async register(command: RegisterAthleteCommand): Promise<Result<RegistrationConfirmation>> {
    const { data, error } = await this.client.rpc("race_register_athlete", registerArgs(command)).single();
    if (error) return err(toRaceError(error));
    return ok(toConfirmation(data as RaceRegistrationConfirmationRow));
  }

  async staffRegister(command: RegisterAthleteCommand): Promise<Result<RegistrationConfirmation>> {
    const { data, error } = await this.client.rpc("race_staff_register_athlete", registerArgs(command)).single();
    if (error) return err(toRaceError(error));
    return ok(toConfirmation(data as RaceRegistrationConfirmationRow));
  }

  async getMyRegistration(token: string): Promise<Result<MyRegistration | null>> {
    const { data, error } = await this.client.rpc("race_get_registration", { p_token: token }).maybeSingle();
    if (error) return err(toRaceError(error));
    return ok(data ? toMyRegistration(data as RaceMyRegistrationRow) : null);
  }

  async updateMyPushupStyle(token: string, style: PushupStyle): Promise<Result<PushupStyle>> {
    const { data, error } = await this.client.rpc("race_update_pushup_style", { p_token: token, p_style: style });
    if (error) return err(toRaceError(error));
    return ok(data as PushupStyle);
  }

  async list(eventId: string, query: string | null, limit: number): Promise<Result<StaffRegistrationRow[]>> {
    const { data, error } = await this.client.rpc("race_list_registrations", {
      p_event_id: eventId,
      p_query: query,
      p_limit: limit,
    });
    if (error) return err(toRaceError(error));
    return ok((data as RaceStaffRegistrationRow[]).map(toStaffRow));
  }

  async confirmPayment(input: ConfirmPaymentInput): Promise<Result<string>> {
    const { data, error } = await this.client.rpc("race_confirm_payment", {
      p_registration_id: input.registrationId,
      p_method: input.method,
      p_amount: input.amount,
      p_notes: input.notes,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) return err(toRaceError(error));
    return ok(data as string);
  }

  async waivePayment(registrationId: string, reason: string): Promise<Result<true>> {
    const { error } = await this.client.rpc("race_waive_payment", { p_registration_id: registrationId, p_reason: reason });
    return error ? err(toRaceError(error)) : ok(true);
  }

  async refundPayment(paymentId: string, reason: string): Promise<Result<true>> {
    const { error } = await this.client.rpc("race_refund_payment", { p_payment_id: paymentId, p_reason: reason });
    return error ? err(toRaceError(error)) : ok(true);
  }

  async cancelRegistration(registrationId: string, reason: string): Promise<Result<true>> {
    const { error } = await this.client.rpc("race_cancel_registration", {
      p_registration_id: registrationId,
      p_reason: reason,
    });
    return error ? err(toRaceError(error)) : ok(true);
  }
}
