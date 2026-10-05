/**
 * Database types for THE NINTH's OWN Supabase project (supabase-race/supabase/migrations).
 * Deliberately independent of the gym system's generated types: the race app never imports the gym schema. Only the RPC surface the app calls is typed — race tables are reached
 * exclusively through RPCs (clients hold no write grants on them).
 */

import type { RaceGender } from "../domain/eligibility";
export type RaceCategoryCode = "MEN" | "WOMEN" | "MASTERS";
export type RacePushupStyle = "STANDARD" | "KNEE";
export type RaceRegistrationStatus = "PENDING_PAYMENT" | "CONFIRMED" | "CANCELLED";
export type RaceAthleteStatus =
  | "REGISTERED"
  | "CHECKED_IN"
  | "LATE_CHECK_IN"
  | "STARTED"
  | "FINISHED"
  | "MISSED_START"
  | "DNF"
  | "WITHDRAWN";
export type RacePaymentStatus = "PENDING" | "PAID" | "REFUNDED" | "CANCELLED";
export type RaceManualPaymentMethod = "CASH" | "INSTAPAY" | "VODAFONE_CASH" | "CARD_POS" | "BANK_TRANSFER";

export interface RaceRegisterAthleteArgs {
  p_event_id: string;
  p_full_name: string;
  p_phone: string;
  p_email: string | null;
  p_gender: RaceGender | null;
  p_date_of_birth: string | null;
  p_category: RaceCategoryCode;
  p_pushup_style?: RacePushupStyle | null;
  p_waiver_accepted?: boolean;
  p_emergency_contact?: { name: string; phone: string } | null;
}

export interface RaceRegistrationConfirmationRow {
  registration_id: string;
  race_number: string;
  access_token: string;
  status: RaceRegistrationStatus;
  amount_due: number;
  currency: string;
}

export interface RaceMyRegistrationRow {
  registration_id: string;
  race_number: string;
  full_name: string;
  category_code: RaceCategoryCode;
  category_name: string;
  status: RaceRegistrationStatus;
  race_status: RaceAthleteStatus;
  pushup_style: RacePushupStyle;
  pushup_style_locked: boolean;
  heat_number: number | null;
  heat_start_at: string | null;
  checkin_closes_at: string | null;
  event_name: string;
  event_slug: string;
  event_date: string;
  venue: string | null;
  timezone: string;
  instructions: string | null;
  payment_status: RacePaymentStatus | null;
  payment_amount: number | null;
  currency: string;
}

export interface RaceCheckInRow {
  check_in_id: string;
  checked_in_at: string;
  kind: "ON_TIME" | "LATE";
  queue_position: number;
  heat_number: number;
  already_checked_in: boolean;
}

export interface RaceStartEventRow { started_at: string; first_start_ms: number; heats_anchored: number }
export interface RacePauseRow { paused_at: string; paused_race_ms: number }
export interface RaceResumeRow { resumed_at: string; paused_ms: number; race_ms: number }
export interface RaceSkipRow { heat_number: number; slot_index: number; race_number: string }
export interface RaceNextHeatRow { heat_number: number; anchor_race_ms: number }
export interface RaceCorrectionRow { correction_id: string; new_check_in_id: string; queue_position: number; heat_number: number; slot_rebound: boolean }
export interface RaceDnsOverrideRow {
  outcome: "ASSIGNED" | "QUEUED" | "NO_SLOT_AVAILABLE";
  queue_position: number | null;
  heat_number: number;
  slot_index: number | null;
}
export interface RaceCloseHeatRow { heat_number: number; athletes_dns: number; slots_emptied: number; next_heat_anchored: number | null }
export type RaceActionType =
  | "REP" | "NO_REP" | "LAP" | "PENALTY" | "HOLD_START" | "HOLD_BREAK" | "HOLD_RESUME" | "TECHNIQUE_SCORE" | "VOID";
export type RaceActionStatus = "ACCEPTED" | "REJECTED" | "PENDING_MASTER_REVIEW";
export interface RaceRecordActionRow {
  performance_event_id: string;
  status: RaceActionStatus;
  rejection_code: string | null;
  server_race_ms: number;
  duplicate: boolean;
  tally: Record<string, unknown>;
}
export interface RaceStationViewJson {
  server_time: string;
  station: { number: number; name: string; has_technique: boolean };
  clock: { started: boolean; paused: boolean; finished: boolean; race_ms: number | null; version: number };
  current: {
    result_id: string;
    race_number: string;
    full_name: string;
    category_code: string;
    movement: string | null;
    state: "WORK" | "TRANSITION";
    window_start_ms: number;
    window_end_ms: number;
    scoring_end_ms: number;
    remaining_ms: number;
    tally: Record<string, unknown>;
  } | null;
  next: { race_number: string; full_name: string; starts_in_ms: number } | null;
}
export interface RaceStationScreenJson {
  server_time: string;
  event: { name: string };
  station: { number: number; name: string; is_last: boolean };
  clock: { started: boolean; paused: boolean; finished: boolean; race_ms: number | null; version: number };
  timing: { work_ms: number; transition_ms: number; get_ready_ms: number };
  current: {
    race_number: string;
    category_code: string;
    window_start_ms: number;
    window_end_ms: number;
    scoring_end_ms: number;
    scoring_type: string | null;
    score: number | null;
  } | null;
  upcoming: { race_number: string; category_code: string; window_start_ms: number } | null;
  planned_next_ms: number | null;
  served_any: boolean;
}
export interface RaceRankRowJson {
  rank: number;
  race_number: string;
  name: string;
  total_points: number;
  placements: Record<string, number>;
  tb_s04: number | null;
  tb_s07: number | null;
}
export interface RaceLeaderboardJson {
  available: boolean;
  server_time?: string;
  event?: { name: string };
  official?: boolean;
  categories?: {
    code: string;
    name: string;
    state: "OFFICIAL" | "PROVISIONAL";
    version: number | null;
    rows: RaceRankRowJson[];
    racing: number;
    excluded: { race_number: string; name: string; status: "DNS" | "DNF" | "WITHDRAWN" }[];
  }[];
}
export interface RaceSnapshotJson {
  category_id: string;
  version: number | null;
  official: boolean;
  unchanged: boolean;
  ranked: number;
  blockers: { ranked: number; racing: number; pending_review: number; not_locked: number; unscored: number; pending_evidence?: number };
}
export interface RaceAthleteResultsJson {
  race_number: string;
  name: string;
  category_code: string;
  race_status: string;
  results: { result_id: string; station: number; station_name: string; status: string; official_score: number | null; technique_score: number | null; has_technique: boolean }[];
}
export interface RaceOcrAttemptJson {
  attempt_id: string; attempt_no: number; status: string; ocr_status: string; proposed_distance_m: number | null; confidence: number | null;
  ocr_text: string | null; ocr_engine: string | null; captured_at: string; capture_race_ms: number | null; image_path: string;
  confirmed_distance_m: number | null; retake_reason: string | null; confirmed_after_transition: boolean; review_reason: string | null; origin: string;
}
export interface RaceRowingViewJson {
  server_time: string;
  station: { number: number; name: string };
  clock: { started: boolean; paused: boolean; finished: boolean; race_ms: number | null; version: number };
  transition_ms: number;
  items: {
    result_id: string; race_number: string; name: string; category_code: string; window_start_ms: number; window_end_ms: number; scoring_end_ms: number;
    phase: string; result_status: string; evidence_state: string; official_distance_m: number | null;
    limits: { min_confidence: number; review_confidence: number; max_distance_m: number };
    attempts: RaceOcrAttemptJson[];
  }[];
}
export interface RaceOcrCaptureJson { attempt_id: string; attempt_no: number; status: string; ocr_status: string; duplicate: boolean; capture_race_ms: number | null; after_transition: boolean | null }
export interface RaceOcrSubmitJson { attempt_id: string; ocr_status: string; proposed_distance_m: number | null; confidence: number | null; duplicate: boolean; requires_acknowledgement?: boolean; can_confirm?: boolean }
export interface RaceOcrConfirmJson { attempt_id: string; status: string; official: boolean; duplicate: boolean; after_transition: boolean | null; distance_m: number | null; score?: number | null }
export interface RaceOcrRetakeJson { attempt_id: string; status: string; duplicate: boolean }
export interface RaceOcrReviewJson { attempt_id: string; status: string; official: boolean; score: number | null }
export interface RaceRowingCorrectionJson { result_id: string; old: number | null; new: number; status: string; evidence_attempt_id: string | null; score: number | null; snapshot: RaceSnapshotJson | null }
export interface RaceEvidenceHistoryJson {
  result_id: string; evidence_state: string; official_distance_m: number | null; result_status: string;
  attempts: Record<string, unknown>[];
  corrections: { id: string; old: number | null; new: number; reason: string; by: string; at: string; evidence_attempt_id: string | null }[];
  audit: { at: string; action: string; actor: string | null; target_id: string; after: unknown; metadata: Record<string, unknown> }[];
}
export interface RaceMoveRow { heat_number: number; queue_position: number; slot_index: number | null }

/** JSON returned by race_control_state (Master Control dashboard). */
export interface RaceControlStateJson {
  server_time: string;
  event: {
    id: string;
    name: string;
    status: string;
    timezone: string;
    first_start_offset_ms: number;
    start_interval_ms: number;
    work_ms: number;
    transition_ms: number;
    announce_lead_ms: number;
  };
  clock: {
    started: boolean;
    paused: boolean;
    finished: boolean;
    race_ms: number | null;
    version: number;
    started_at: string | null;
    paused_at: string | null;
    pre_race: boolean;
  };
  next_athlete: {
    registration_id: string;
    race_number: string;
    full_name: string;
    category_code: string;
    heat: number;
    slot_index: number;
    start_ms: number;
    starts_in_ms: number;
    announce_in_ms: number;
  } | null;
  skippable: {
    slot_id: string;
    registration_id: string;
    race_number: string;
    full_name: string;
    category_code: string;
    heat: number;
    slot_index: number;
    is_overflow: boolean;
    status: "BOUND" | "STARTED";
    start_ms: number;
    starts_in_ms: number;
  }[];
  stations: {
    number: number;
    name: string;
    state: "IDLE" | "WORK" | "TRANSITION";
    athlete: { race_number: string; full_name: string; category_code: string } | null;
    window_start_ms: number | null;
    window_end_ms: number | null;
    scoring_end_ms: number | null;
    remaining_ms: number | null;
    score: null;
  }[];
  heats: {
    number: number;
    status: string;
    anchor_ms: number | null;
    planned_slots: number | null;
    start_mode: "AUTO" | "MANUAL";
    roster: number;
    started: number;
    bound: number;
    empty: number;
    skipped: number;
    open: number;
  }[];
  counts: { registered: number; checked_in: number; racing: number; finished: number; dns: number; dnf: number };
  attention: {
    dns: { registration_id: string; race_number: string; full_name: string; heat: number | null; was_skipped: boolean }[];
    no_slot: { registration_id: string; race_number: string; full_name: string; heat: number }[];
  };
}

/** JSON returned by race_advance / the engine tick. */
export interface RaceAdvanceJson {
  advanced?: boolean;
  busy?: boolean;
  race_ms?: number;
  paused?: boolean;
  athletes_started?: number;
  athletes_finished?: number;
  event_finished?: boolean;
}

export interface RaceQueueRow {
  heat_number: number;
  queue_position: number;
  registration_id: string;
  race_number: string;
  full_name: string;
  category_code: RaceCategoryCode;
  race_status: RaceAthleteStatus;
  checked_in_at: string;
  kind: "ON_TIME" | "LATE";
  slot_index: number | null;
  slot_status: "OPEN" | "BOUND" | "STARTED" | "SKIPPED" | "EMPTY" | null;
  is_overflow: boolean | null;
  projected_slot_index: number | null;
  projected_start_ms: number | null;
  projected_start_at: string | null;
  no_slot_available: boolean;
}

export interface RacePublicEventRow {
  event_id: string;
  slug: string;
  name: string;
  event_date: string;
  venue: string | null;
  timezone: string;
  status: string;
  registration_open: boolean;
  registration_fee: number;
  currency: string;
  instructions: string | null;
  planned_start_at: string | null;
  heats_locked: boolean;
}

export interface RaceStaffRegistrationRow {
  registration_id: string;
  race_number: string;
  full_name: string;
  phone: string;
  email: string | null;
  gender: RaceGender | null;
  category_code: RaceCategoryCode;
  heat_id: string | null;
  heat_number: number | null;
  status: RaceRegistrationStatus;
  race_status: RaceAthleteStatus;
  pushup_style: RacePushupStyle;
  payment_id: string | null;
  payment_status: RacePaymentStatus | null;
  payment_amount: number | null;
  payment_method: RaceManualPaymentMethod | null;
  paid_at: string | null;
  created_at: string;
}



export interface RaceDatabase {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: {
      race_register_athlete: {
        Args: RaceRegisterAthleteArgs;
        Returns: RaceRegistrationConfirmationRow[];
      };
      race_staff_register_athlete: {
        Args: RaceRegisterAthleteArgs;
        Returns: RaceRegistrationConfirmationRow[];
      };
      race_check_in: {
        Args: { p_registration_id: string };
        Returns: RaceCheckInRow[];
      };
      race_rowing_view: { Args: { p_event_id: string; p_all?: boolean }; Returns: RaceRowingViewJson };
      race_ocr_capture: {
        Args: {
          p_station_result_id: string; p_client_capture_id: string; p_storage_path: string; p_image_mime: string; p_image_bytes: number; p_image_sha256: string;
          p_origin?: "ONLINE" | "OFFLINE_QUEUE"; p_device_recorded_at?: string | null; p_device_race_ms?: number | null; p_device_seq?: number | null; p_device_id?: string | null;
        };
        Returns: RaceOcrCaptureJson;
      };
      race_ocr_submit: {
        Args: { p_attempt_id: string; p_provider: string; p_engine: string; p_raw_text: string; p_raw_response: Record<string, unknown>; p_distance_m: number | null; p_confidence: number | null };
        Returns: RaceOcrSubmitJson;
      };
      race_ocr_confirm: { Args: { p_attempt_id: string; p_client_event_id: string; p_acknowledge_low_confidence?: boolean }; Returns: RaceOcrConfirmJson };
      race_ocr_retake: { Args: { p_attempt_id: string; p_client_event_id: string; p_reason?: string | null }; Returns: RaceOcrRetakeJson };
      race_ocr_review: { Args: { p_attempt_id: string; p_decision: "APPROVED" | "REJECTED"; p_reason: string }; Returns: RaceOcrReviewJson };
      race_correct_rowing_result: { Args: { p_result_id: string; p_distance_m: number; p_reason: string; p_evidence_attempt_id?: string | null }; Returns: RaceRowingCorrectionJson };
      race_evidence_history: { Args: { p_result_id: string }; Returns: RaceEvidenceHistoryJson };
      race_leaderboard: {
        Args: { p_event_id: string; p_category_code?: string | null };
        Returns: RaceLeaderboardJson;
      };
      race_compute_rankings: {
        Args: { p_event_id: string; p_category_id?: string | null; p_official?: boolean };
        Returns: { official: boolean; categories: RaceSnapshotJson[] };
      };
      race_publish_results: {
        Args: { p_event_id: string };
        Returns: { status: string; already: boolean; rankings?: { official: boolean; categories: RaceSnapshotJson[] } };
      };
      race_athlete_results: {
        Args: { p_event_id: string; p_race_number: string };
        Returns: RaceAthleteResultsJson;
      };
      race_correct_station_result: {
        Args: { p_result_id: string; p_field: string; p_value: number; p_reason: string };
        Returns: { result_id: string; field: string; old: number | null; new: number; status: string; snapshot: RaceSnapshotJson | null };
      };
      race_station_screen: {
        Args: { p_event_id: string; p_station_number: number };
        Returns: RaceStationScreenJson;
      };
      race_record_action: {
        Args: {
          p_station_result_id: string;
          p_type: RaceActionType;
          p_client_event_id: string;
          p_value?: number | null;
          p_origin?: "ONLINE" | "OFFLINE_QUEUE";
          p_device_recorded_at?: string | null;
          p_device_race_ms?: number | null;
          p_device_seq?: number | null;
          p_device_id?: string | null;
          p_voids_event_id?: string | null;
        };
        Returns: RaceRecordActionRow[];
      };
      race_review_action: {
        Args: { p_performance_event_id: string; p_decision: "APPROVED" | "REJECTED"; p_reason: string };
        Returns: Record<string, unknown>;
      };
      race_station_view: {
        Args: { p_event_id: string; p_station_number: number };
        Returns: RaceStationViewJson;
      };
      race_close_heat_without_start: {
        Args: { p_event_id: string; p_heat_number: number; p_reason: string };
        Returns: RaceCloseHeatRow[];
      };
      race_start_event: {
        Args: { p_event_id: string };
        Returns: RaceStartEventRow[];
      };
      race_pause: {
        Args: { p_event_id: string; p_reason?: string | null };
        Returns: RacePauseRow[];
      };
      race_resume: {
        Args: { p_event_id: string };
        Returns: RaceResumeRow[];
      };
      race_advance: {
        Args: { p_event_id: string };
        Returns: RaceAdvanceJson;
      };
      race_control_state: {
        Args: { p_event_id: string };
        Returns: RaceControlStateJson;
      };
      race_skip_athlete: {
        Args: { p_slot_id: string; p_reason: string };
        Returns: RaceSkipRow[];
      };
      race_mark_dnf: {
        Args: { p_registration_id: string; p_reason: string };
        Returns: undefined;
      };
      race_start_next_heat: {
        Args: { p_event_id: string; p_heat_number: number };
        Returns: RaceNextHeatRow[];
      };
      race_correct_check_in: {
        Args: { p_old_registration_id: string; p_new_registration_id: string; p_reason: string };
        Returns: RaceCorrectionRow[];
      };
      race_override_dns: {
        Args: { p_registration_id: string; p_reason: string };
        Returns: RaceDnsOverrideRow[];
      };
      race_move_athlete_later_heat: {
        Args: { p_registration_id: string; p_target_heat_number: number; p_reason: string };
        Returns: RaceMoveRow[];
      };
      race_queue: {
        Args: { p_event_id: string; p_heat_number?: number | null };
        Returns: RaceQueueRow[];
      };
      race_get_public_event: {
        Args: { p_slug: string };
        Returns: RacePublicEventRow[];
      };
      race_get_registration: {
        Args: { p_token: string };
        Returns: RaceMyRegistrationRow[];
      };
      race_update_pushup_style: {
        Args: { p_token: string; p_style: RacePushupStyle };
        Returns: RacePushupStyle;
      };
      race_list_registrations: {
        Args: { p_event_id: string; p_query?: string | null; p_limit?: number };
        Returns: RaceStaffRegistrationRow[];
      };
      race_confirm_payment: {
        Args: {
          p_registration_id: string;
          p_method: RaceManualPaymentMethod;
          p_amount?: number | null;
          p_notes?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: string;
      };
      race_waive_payment: {
        Args: { p_registration_id: string; p_reason: string };
        Returns: undefined;
      };
      race_refund_payment: {
        Args: { p_payment_id: string; p_reason: string };
        Returns: undefined;
      };
      race_cancel_registration: {
        Args: { p_registration_id: string; p_reason: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
