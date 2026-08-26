import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { AttendanceRepository } from "../domain/attendance-repository";
import type { AttendanceRecord } from "../domain/attendance";

interface AttendanceRow {
  id: string;
  profile_id: string;
  branch_id: string;
  clock_in: string;
  clock_out: string | null;
  clock_in_latitude: number | string | null;
  clock_in_longitude: number | string | null;
  // `profiles` is a to-one embed (the FK is on attendance_records, pointing
  // at profiles — "belongs to" from this query's side), so PostgREST
  // returns a single object, not an array. See docs/phase-1/14-reception-
  // membership.md's note on this — the same mistake, once copy-pasted into
  // several repositories, produced blank names on the Expiring page,
  // Member Detail history, Receipts, and here.
  // supabase-js's own inferred type for this embed is unreliable
  // (@9thround/database-types has no `Relationships` metadata for it to
  // key off — every field resolves to `any` regardless of real
  // cardinality), so every call site below casts through this
  // hand-written, correct-by-construction interface rather than trusting
  // that inference.
  profiles: { full_name: string | null } | null;
}

function toRecord(row: AttendanceRow): AttendanceRecord {
  return {
    id: row.id,
    profileId: row.profile_id,
    profileFullName: row.profiles?.full_name ?? null,
    branchId: row.branch_id,
    clockIn: new Date(row.clock_in),
    clockOut: row.clock_out ? new Date(row.clock_out) : null,
    clockInLatitude: row.clock_in_latitude === null ? null : Number(row.clock_in_latitude),
    clockInLongitude: row.clock_in_longitude === null ? null : Number(row.clock_in_longitude),
  };
}

const SELECT_COLUMNS =
  "id, profile_id, branch_id, clock_in, clock_out, clock_in_latitude, clock_in_longitude, profiles (full_name)";

export class SupabaseAttendanceRepository implements AttendanceRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async findOpenForProfile(profileId: string): Promise<Result<AttendanceRecord | null>> {
    const { data, error } = await this.client
      .from("attendance_records")
      .select(SELECT_COLUMNS)
      .eq("profile_id", profileId)
      .is("clock_out", null)
      .maybeSingle();

    if (error) return err(domainError("ATTENDANCE_LOOKUP_FAILED", error.message));
    return ok(data ? toRecord(data as unknown as AttendanceRow) : null);
  }

  async clockIn(profileId: string, branchId: string, latitude: number, longitude: number): Promise<Result<AttendanceRecord>> {
    // clock_in_at_location() (supabase/migrations/20260826000001) is the
    // real, server-side enforcement of "you must be at the branch" — it
    // never raises for an out-of-range attempt, it returns
    // is_within_range = false with the computed distance, so this maps to
    // a precise TOO_FAR_FROM_BRANCH domain error instead of a generic one.
    const { data, error } = await this.client
      .rpc("clock_in_at_location", { p_branch_id: branchId, p_latitude: latitude, p_longitude: longitude })
      .single();

    if (error) return err(domainError("CLOCK_IN_FAILED", error.message));

    const row = data as {
      id: string | null;
      profile_id: string | null;
      branch_id: string | null;
      clock_in: string | null;
      clock_out: string | null;
      is_within_range: boolean;
      distance_meters: number | string | null;
    };

    if (!row.is_within_range || !row.id || !row.clock_in) {
      const distance = row.distance_meters === null ? null : Math.round(Number(row.distance_meters));
      return err(
        domainError(
          "TOO_FAR_FROM_BRANCH",
          distance === null
            ? "You must be at the branch to clock in."
            : `You're ${distance}m from the branch — move closer and try again.`,
        ),
      );
    }

    return ok({
      id: row.id,
      profileId: row.profile_id ?? profileId,
      profileFullName: null,
      branchId: row.branch_id ?? branchId,
      clockIn: new Date(row.clock_in),
      clockOut: row.clock_out ? new Date(row.clock_out) : null,
      clockInLatitude: latitude,
      clockInLongitude: longitude,
    });
  }

  async clockOut(recordId: string): Promise<Result<AttendanceRecord>> {
    const { data, error } = await this.client
      .from("attendance_records")
      .update({ clock_out: new Date().toISOString() })
      .eq("id", recordId)
      .select(SELECT_COLUMNS)
      .single();

    if (error) return err(domainError("CLOCK_OUT_FAILED", error.message));
    return ok(toRecord(data as unknown as AttendanceRow));
  }

  async listForBranch(branchId: string, startDate: string, endDate: string): Promise<Result<AttendanceRecord[]>> {
    const { data, error } = await this.client
      .from("attendance_records")
      .select(SELECT_COLUMNS)
      .eq("branch_id", branchId)
      .gte("clock_in", startDate)
      .lte("clock_in", `${endDate}T23:59:59.999`)
      .order("clock_in", { ascending: false });

    if (error) return err(domainError("LIST_ATTENDANCE_FAILED", error.message));
    return ok((data as unknown as AttendanceRow[]).map(toRecord));
  }
}
