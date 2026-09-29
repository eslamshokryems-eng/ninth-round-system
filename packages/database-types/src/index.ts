/**
 * Hand-authored placeholder matching supabase/migrations as of the Identity
 * context implementation. Once a real Supabase project exists, replace this
 * file's contents with the output of:
 *
 *   pnpm db:types   # supabase gen types typescript --local > packages/database-types/src/index.ts
 *
 * committed in the same PR as any migration change (docs/phase-1/02-database-schema.md §2.6).
 * Only `infrastructure/` layers may import from this package — see
 * docs/13-ddd-architecture.md; domain entities are deliberately NOT shaped
 * like these rows.
 */

export type UserRole =
  | "member"
  | "coach"
  | "reception"
  | "sales_employee"
  | "branch_manager"
  | "super_admin";
export type StaffRole = "coach" | "reception";
export type AssignmentContext = "training" | "nutrition";
export type LocaleCode = "en" | "ar";
export type FitnessGoal = "weight_loss" | "muscle_gain" | "general_fitness" | "athletic_performance";
export type Gender = "female" | "male" | "unspecified";
export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type TrainerClientStatus = "active" | "paused" | "ended";

export interface ProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  preferred_locale: LocaleCode;
  gender: Gender | null;
  date_of_birth: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  goal: FitnessGoal | null;
  experience_level: ExperienceLevel | null;
  onboarding_completed_at: string | null;
  referral_code: string;
  referred_by: string | null;
  branch_id: string | null;
  last_seen_at: string | null;
  phone: string | null;
  address: string | null;
  employee_code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// --- Audit Log & Advanced Permissions (docs/phase-1/17-audit-log-and-permissions.md) ---

export interface AdminAuditLogRow {
  id: string;
  admin_id: string | null;
  actor_role: string | null;
  actor_full_name: string | null;
  action: string;
  target_table: string;
  target_id: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  created_at: string;
}

export interface PermissionRow {
  key: string;
  category: string;
  description: string;
}

export interface RolePermissionRow {
  role: UserRole;
  permission_key: string;
}

export interface UserPermissionOverrideRow {
  profile_id: string;
  permission_key: string;
  granted: boolean;
  granted_by: string | null;
  created_at: string;
}

export interface StaffProfileRow {
  profile_id: string;
  role: StaffRole;
  bio: string | null;
  specialties: string[];
  certifications: unknown;
  years_experience: number | null;
  is_approved: boolean;
  rating_avg: number | null;
  created_at: string;
  updated_at: string;
}

export interface StaffClientAssignmentRow {
  id: string;
  staff_id: string;
  client_id: string;
  context: AssignmentContext;
  status: TrainerClientStatus;
  assigned_at: string;
}

// --- 9th Round Reception & Membership System (docs/phase-1/14-reception-membership.md) ---

export type MembershipStatus = "active" | "expired" | "cancelled";
export type MembershipPaymentStatus = "paid" | "partial" | "unpaid";
export type MembershipPaymentMethod = "cash" | "visa" | "instapay" | "vodafone_cash";
export type MembershipAlertType = "expiring_7_days" | "expiring_3_days" | "expiring_today" | "expired";
export type ExpenseCategory = "rent" | "utilities" | "salaries" | "maintenance" | "supplies" | "marketing" | "other";

export interface BranchRow {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberRow {
  id: string;
  branch_id: string;
  member_code: string;
  full_name: string;
  phone: string;
  email: string | null;
  gender: Gender | null;
  date_of_birth: string | null;
  national_id: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address: string | null;
  notes: string | null;
  profile_image_url: string | null;
  qr_code: string;
  linked_profile_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipTypeRow {
  id: string;
  name: string;
  duration_days: number;
  price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MembershipRow {
  id: string;
  member_id: string;
  branch_id: string;
  membership_type_id: string;
  membership_number: string;
  receipt_number: string;
  start_date: string;
  end_date: string;
  price: number;
  discount: number;
  final_price: number;
  payment_status: MembershipPaymentStatus;
  payment_method: MembershipPaymentMethod;
  status: MembershipStatus;
  notes: string | null;
  coach_id: string | null;
  session_count: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipPaymentRow {
  id: string;
  membership_id: string;
  payment_date: string;
  amount: number;
  payment_method: MembershipPaymentMethod;
  reference_number: string | null;
  notes: string | null;
  received_by: string | null;
  created_at: string;
}

export interface MembershipAlertRow {
  id: string;
  membership_id: string;
  alert_type: MembershipAlertType;
  alert_date: string;
  is_acknowledged: boolean;
  created_at: string;
}

export interface CheckInRow {
  id: string;
  member_id: string;
  branch_id: string;
  checked_in_at: string;
  checked_in_by: string | null;
  created_at: string;
}

export interface ExpenseRow {
  id: string;
  branch_id: string;
  category: ExpenseCategory;
  description: string | null;
  amount: number;
  expense_date: string;
  payment_method: MembershipPaymentMethod;
  receipt_reference: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface OtherSaleRow {
  id: string;
  branch_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  payment_method: MembershipPaymentMethod;
  buyer_name: string | null;
  buyer_phone: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// --- Login Verification & Trusted Devices (device_verification migration) ---

export interface SecuritySettingRow {
  id: string;
  key: string;
  value: string;
  updated_at: string;
  updated_by: string | null;
}

export interface TrustedDeviceRow {
  id: string;
  user_id: string;
  device_token_hash: string;
  device_name: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export interface DeviceVerificationCodeRow {
  id: string;
  user_id: string;
  code_hash: string;
  attempts: number;
  max_attempts: number;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

export interface ReceptionDashboardStatsRow {
  active_members: number;
  new_members_today: number;
  expiring_today: number;
  expiring_this_week: number;
  expired_memberships: number;
  daily_revenue: number;
  monthly_revenue: number;
}

// --- THE NINTH race system (supabase/migrations/2026092800000x, 20260929000002) ---
// Only the RPC surface the app calls is typed here; race tables are reached
// exclusively through RPCs (clients hold no write grants on them).
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
  p_gender: Gender | null;
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
  gender: Gender | null;
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


// Shape (Tables/Views/Functions/Enums/CompositeTypes, and Relationships per
// table) matches what `supabase gen types typescript` emits, so swapping
// this file for the generated one later is a drop-in replacement.
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & Pick<ProfileRow, "id">;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      staff_profiles: {
        Row: StaffProfileRow;
        Insert: Partial<StaffProfileRow> & Pick<StaffProfileRow, "profile_id" | "role">;
        Update: Partial<StaffProfileRow>;
        Relationships: [];
      };
      staff_client_assignments: {
        Row: StaffClientAssignmentRow;
        Insert: Partial<StaffClientAssignmentRow> &
          Pick<StaffClientAssignmentRow, "staff_id" | "client_id">;
        Update: Partial<StaffClientAssignmentRow>;
        Relationships: [];
      };
      branches: {
        Row: BranchRow;
        Insert: Partial<BranchRow> & Pick<BranchRow, "name">;
        Update: Partial<BranchRow>;
        Relationships: [];
      };
      members: {
        Row: MemberRow;
        Insert: Partial<MemberRow> & Pick<MemberRow, "branch_id" | "full_name" | "phone">;
        Update: Partial<MemberRow>;
        Relationships: [];
      };
      membership_types: {
        Row: MembershipTypeRow;
        Insert: Partial<MembershipTypeRow> & Pick<MembershipTypeRow, "name" | "duration_days">;
        Update: Partial<MembershipTypeRow>;
        Relationships: [];
      };
      memberships: {
        Row: MembershipRow;
        Insert: Partial<MembershipRow> &
          Pick<
            MembershipRow,
            | "member_id"
            | "branch_id"
            | "membership_type_id"
            | "receipt_number"
            | "start_date"
            | "end_date"
            | "price"
            | "payment_method"
          >;
        Update: Partial<MembershipRow>;
        Relationships: [];
      };
      membership_payments: {
        Row: MembershipPaymentRow;
        Insert: Partial<MembershipPaymentRow> &
          Pick<MembershipPaymentRow, "membership_id" | "amount" | "payment_method">;
        Update: Partial<MembershipPaymentRow>;
        Relationships: [];
      };
      membership_alerts: {
        Row: MembershipAlertRow;
        Insert: Partial<MembershipAlertRow> &
          Pick<MembershipAlertRow, "membership_id" | "alert_type" | "alert_date">;
        Update: Partial<MembershipAlertRow>;
        Relationships: [];
      };
      check_ins: {
        Row: CheckInRow;
        Insert: Partial<CheckInRow> & Pick<CheckInRow, "member_id" | "branch_id">;
        Update: Partial<CheckInRow>;
        Relationships: [];
      };
      expenses: {
        Row: ExpenseRow;
        Insert: Partial<ExpenseRow> & Pick<ExpenseRow, "branch_id" | "category" | "amount" | "payment_method">;
        Update: Partial<ExpenseRow>;
        Relationships: [];
      };
      other_sales: {
        Row: OtherSaleRow;
        Insert: Partial<OtherSaleRow> &
          Pick<OtherSaleRow, "branch_id" | "item_name" | "unit_price" | "payment_method">;
        Update: Partial<OtherSaleRow>;
        Relationships: [];
      };
      // Insert/Update are typed but unused in practice: every write to
      // these three tables goes through a SECURITY DEFINER function
      // (log_audit_event(), set_role_permission(), etc. — see
      // 20260815000001_audit_log.sql / 20260815000002_permissions_and_
      // staff_status.sql), never a direct `.insert()`/`.update()` call —
      // there is no RLS policy that would let one succeed anyway.
      admin_audit_log: {
        Row: AdminAuditLogRow;
        Insert: Partial<AdminAuditLogRow> & Pick<AdminAuditLogRow, "action" | "target_table">;
        Update: Partial<AdminAuditLogRow>;
        Relationships: [];
      };
      permissions: {
        Row: PermissionRow;
        Insert: PermissionRow;
        Update: Partial<PermissionRow>;
        Relationships: [];
      };
      role_permissions: {
        Row: RolePermissionRow;
        Insert: RolePermissionRow;
        Update: Partial<RolePermissionRow>;
        Relationships: [];
      };
      user_permission_overrides: {
        Row: UserPermissionOverrideRow;
        Insert: Partial<UserPermissionOverrideRow> &
          Pick<UserPermissionOverrideRow, "profile_id" | "permission_key" | "granted">;
        Update: Partial<UserPermissionOverrideRow>;
        Relationships: [];
      };
      // security_settings/trusted_devices/device_verification_codes carry
      // zero RLS policies beyond security_settings' own super_admin-only
      // select/update (see 20260922000001_device_verification.sql) — every
      // read/write to all three goes through a service-role Route Handler
      // under apps/web/app/api/auth/device/*, never a direct client call.
      security_settings: {
        Row: SecuritySettingRow;
        Insert: Partial<SecuritySettingRow> & Pick<SecuritySettingRow, "key" | "value">;
        Update: Partial<SecuritySettingRow>;
        Relationships: [];
      };
      trusted_devices: {
        Row: TrustedDeviceRow;
        Insert: Partial<TrustedDeviceRow> &
          Pick<TrustedDeviceRow, "user_id" | "device_token_hash" | "expires_at">;
        Update: Partial<TrustedDeviceRow>;
        Relationships: [];
      };
      device_verification_codes: {
        Row: DeviceVerificationCodeRow;
        Insert: Partial<DeviceVerificationCodeRow> &
          Pick<DeviceVerificationCodeRow, "user_id" | "code_hash" | "expires_at">;
        Update: Partial<DeviceVerificationCodeRow>;
        Relationships: [];
      };
    };
    Views: {
      reception_dashboard_stats: {
        Row: ReceptionDashboardStatsRow;
        Relationships: [];
      };
    };
    Functions: {
      register_membership: {
        Args: {
          p_branch_id: string;
          p_full_name: string;
          p_phone: string;
          p_gender: Gender | null;
          p_date_of_birth: string | null;
          p_national_id: string | null;
          p_membership_type_id: string;
          p_receipt_number: string;
          p_price: number;
          p_discount: number;
          p_start_date: string;
          p_payment_method: MembershipPaymentMethod;
          p_notes: string | null;
          p_address?: string | null;
          p_emergency_contact_name?: string | null;
          p_emergency_contact_phone?: string | null;
          p_photo_url?: string | null;
          p_coach_id?: string | null;
          p_session_count?: number | null;
        };
        Returns: {
          member_id: string;
          membership_id: string;
          membership_number: string;
          member_qr_code: string;
        }[];
      };
      renew_membership: {
        Args: {
          p_member_id: string;
          p_membership_type_id: string;
          p_receipt_number: string;
          p_price: number;
          p_discount: number;
          p_payment_method: MembershipPaymentMethod;
          p_notes: string | null;
          p_coach_id?: string | null;
          p_session_count?: number | null;
        };
        Returns: { membership_id: string; membership_number: string; start_date: string; end_date: string }[];
      };
      check_in_member: {
        Args: { p_member_id: string };
        Returns: { check_in_id: string; checked_in_at: string }[];
      };
      next_membership_number: {
        Args: Record<string, never>;
        Returns: string;
      };
      next_employee_code: {
        Args: Record<string, never>;
        Returns: string;
      };
      resolve_login_email: {
        Args: { p_employee_code: string };
        Returns: string | null;
      };
      has_permission: {
        Args: { p_permission_key: string };
        Returns: boolean;
      };
      log_auth_event: {
        Args: { p_action: string; p_identifier?: string | null };
        Returns: undefined;
      };
      log_audit_event_as: {
        Args: {
          p_actor_id: string;
          p_action: string;
          p_entity_type: string;
          p_entity_id: string | null;
          p_previous_value?: unknown;
          p_new_value?: unknown;
          p_metadata?: unknown;
        };
        Returns: string;
      };
      set_role_permission: {
        Args: { p_role: UserRole; p_permission_key: string; p_granted: boolean };
        Returns: undefined;
      };
      set_user_permission_override: {
        Args: { p_profile_id: string; p_permission_key: string; p_granted: boolean };
        Returns: undefined;
      };
      clear_user_permission_override: {
        Args: { p_profile_id: string; p_permission_key: string };
        Returns: undefined;
      };
      delete_receipt: {
        Args: { p_payment_id: string; p_reason: string };
        Returns: undefined;
      };
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
