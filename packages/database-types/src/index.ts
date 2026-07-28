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

export type UserRole = "client" | "trainer" | "nutritionist" | "reception" | "admin" | "super_admin";
export type StaffRole = "trainer" | "nutritionist" | "reception";
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
