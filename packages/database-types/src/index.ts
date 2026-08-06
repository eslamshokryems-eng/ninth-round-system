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

export type UserRole = "member" | "coach" | "reception" | "branch_manager" | "super_admin";
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
  created_at: string;
  updated_at: string;
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

export type MembershipType = "monthly" | "quarterly" | "semi_annual" | "annual" | "custom";
export type MembershipStatus = "active" | "expired" | "cancelled";
export type MembershipPaymentStatus = "paid" | "partial" | "unpaid";
export type MembershipPaymentMethod = "cash" | "visa" | "instapay" | "vodafone_cash";
export type MembershipAlertType = "expiring_7_days" | "expiring_3_days" | "expiring_today" | "expired";

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
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address: string | null;
  notes: string | null;
  profile_image_url: string | null;
  linked_profile_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MembershipRow {
  id: string;
  member_id: string;
  branch_id: string;
  membership_type: MembershipType;
  start_date: string;
  end_date: string;
  price: number;
  discount: number;
  final_price: number;
  payment_status: MembershipPaymentStatus;
  status: MembershipStatus;
  notes: string | null;
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

export interface ReceptionDashboardStatsRow {
  active_members: number;
  new_members_today: number;
  expiring_today: number;
  expiring_this_week: number;
  expired_memberships: number;
  daily_revenue: number;
  monthly_revenue: number;
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
      memberships: {
        Row: MembershipRow;
        Insert: Partial<MembershipRow> &
          Pick<MembershipRow, "member_id" | "branch_id" | "membership_type" | "start_date" | "end_date" | "price">;
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
    };
    Views: {
      reception_dashboard_stats: {
        Row: ReceptionDashboardStatsRow;
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
