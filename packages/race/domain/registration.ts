import type { PushupStyle, RaceCategoryCode, RaceGender } from "./eligibility";

export type RegistrationStatus = "PENDING_PAYMENT" | "CONFIRMED" | "CANCELLED";
export type RaceStatus =
  | "REGISTERED"
  | "CHECKED_IN"
  | "LATE_CHECK_IN"
  | "STARTED"
  | "FINISHED"
  | "MISSED_START"
  | "DNF"
  | "WITHDRAWN";
export type PaymentStatus = "PENDING" | "PAID" | "REFUNDED" | "CANCELLED";
export type ManualPaymentMethod = "CASH" | "INSTAPAY" | "VODAFONE_CASH" | "CARD_POS" | "BANK_TRANSFER";

export const MANUAL_PAYMENT_METHODS: readonly { value: ManualPaymentMethod; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "INSTAPAY", label: "InstaPay" },
  { value: "VODAFONE_CASH", label: "Vodafone Cash" },
  { value: "CARD_POS", label: "Card (POS)" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
];

export interface EmergencyContact {
  name: string;
  phone: string;
}

/** What the registration form collects. `eventDate` (YYYY-MM-DD) is used only for instant client-side eligibility feedback. */
export interface RegisterAthleteInput {
  eventId: string;
  eventDate: string;
  fullName: string;
  phone: string;
  email: string | null;
  gender: RaceGender;
  dateOfBirth: string | null;
  category: RaceCategoryCode;
  pushupStyle: PushupStyle | null;
  waiverAccepted: boolean;
  emergencyContact: EmergencyContact;
}

export type RegisterAthleteCommand = Omit<RegisterAthleteInput, "eventDate">;

export interface RegistrationConfirmation {
  registrationId: string;
  raceNumber: string;
  /** Secret link token — shown once, never stored in plain text server-side. */
  accessToken: string;
  status: RegistrationStatus;
  amountDue: number;
  currency: string;
}

/** The athlete's own view, looked up by their secret token. */
export interface MyRegistration {
  registrationId: string;
  raceNumber: string;
  fullName: string;
  categoryCode: RaceCategoryCode;
  categoryName: string;
  status: RegistrationStatus;
  raceStatus: RaceStatus;
  pushupStyle: PushupStyle;
  pushupStyleLocked: boolean;
  heatNumber: number | null;
  /** Planned heat start (ISO). Null until heats are locked. Subject to change until START EVENT. */
  heatStartAt: string | null;
  checkinClosesAt: string | null;
  eventName: string;
  eventSlug: string;
  eventDate: string;
  venue: string | null;
  timezone: string;
  instructions: string | null;
  paymentStatus: PaymentStatus | null;
  paymentAmount: number | null;
  currency: string;
}

/** A row of the staff registration list / reception search. */
export interface StaffRegistrationRow {
  registrationId: string;
  raceNumber: string;
  fullName: string;
  phone: string;
  email: string | null;
  gender: RaceGender | null;
  categoryCode: RaceCategoryCode;
  heatId: string | null;
  heatNumber: number | null;
  status: RegistrationStatus;
  raceStatus: RaceStatus;
  pushupStyle: PushupStyle;
  paymentId: string | null;
  paymentStatus: PaymentStatus | null;
  paymentAmount: number | null;
  paymentMethod: ManualPaymentMethod | null;
  paidAt: string | null;
  createdAt: string;
}

export interface ConfirmPaymentInput {
  registrationId: string;
  method: ManualPaymentMethod;
  /** Defaults to the fee. A different amount requires notes. */
  amount: number | null;
  notes: string | null;
  /** Makes retries/double-clicks safe: the same key can never record a second payment. */
  idempotencyKey: string;
}

/** What the public event page (and staff pages, by slug) needs about an event. */
export interface PublicRaceEvent {
  eventId: string;
  slug: string;
  name: string;
  /** YYYY-MM-DD */
  eventDate: string;
  venue: string | null;
  timezone: string;
  status: string;
  registrationOpen: boolean;
  registrationFee: number;
  currency: string;
  instructions: string | null;
  plannedStartAt: string | null;
  heatsLocked: boolean;
}

export type CheckInKind = "ON_TIME" | "LATE";
export type SlotStatus = "OPEN" | "BOUND" | "STARTED" | "SKIPPED" | "EMPTY";

export interface CheckInResult {
  checkInId: string;
  checkedInAt: string;
  kind: CheckInKind;
  /** 1-based position in the athlete's heat, decided by the server from the check-in order. */
  queuePosition: number;
  heatNumber: number;
  /** True when this athlete had already been checked in (double click, second desk): nothing changed. */
  alreadyCheckedIn: boolean;
}

/** One checked-in athlete in start order. Slot times are never stored: they are heat anchor + slot × interval. */
export interface QueueEntry {
  heatNumber: number;
  queuePosition: number;
  registrationId: string;
  raceNumber: string;
  fullName: string;
  categoryCode: RaceCategoryCode;
  raceStatus: RaceStatus;
  checkedInAt: string;
  kind: CheckInKind;
  /** The athlete's bound slot, once the binder has assigned one. */
  slotIndex: number | null;
  slotStatus: SlotStatus | null;
  isOverflow: boolean;
  /** Where the athlete will start if nothing changes (the next free slot for those not bound yet). */
  projectedSlotIndex: number | null;
  projectedStartMs: number | null;
  projectedStartAt: string | null;
  /** Late athlete for whom no slot fits inside the heat gap: an Event Manager must move them. */
  noSlotAvailable: boolean;
}
