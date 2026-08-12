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
  profiles: { full_name: string | null }[];
}

function toRecord(row: AttendanceRow): AttendanceRecord {
  return {
    id: row.id,
    profileId: row.profile_id,
    profileFullName: row.profiles[0]?.full_name ?? null,
    branchId: row.branch_id,
    clockIn: new Date(row.clock_in),
    clockOut: row.clock_out ? new Date(row.clock_out) : null,
  };
}

const SELECT_COLUMNS = "id, profile_id, branch_id, clock_in, clock_out, profiles (full_name)";

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
    return ok(data ? toRecord(data) : null);
  }

  async clockIn(profileId: string, branchId: string): Promise<Result<AttendanceRecord>> {
    const { data, error } = await this.client
      .from("attendance_records")
      .insert({ profile_id: profileId, branch_id: branchId })
      .select(SELECT_COLUMNS)
      .single();

    if (error) return err(domainError("CLOCK_IN_FAILED", error.message));
    return ok(toRecord(data));
  }

  async clockOut(recordId: string): Promise<Result<AttendanceRecord>> {
    const { data, error } = await this.client
      .from("attendance_records")
      .update({ clock_out: new Date().toISOString() })
      .eq("id", recordId)
      .select(SELECT_COLUMNS)
      .single();

    if (error) return err(domainError("CLOCK_OUT_FAILED", error.message));
    return ok(toRecord(data));
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
    return ok(data.map(toRecord));
  }
}
