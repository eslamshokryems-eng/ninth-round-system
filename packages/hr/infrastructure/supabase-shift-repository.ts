import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { CreateShiftInput, ShiftRepository } from "../domain/shift-repository";
import type { DayOfWeek, Shift } from "../domain/shift";

interface ShiftRow {
  id: string;
  profile_id: string;
  branch_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  profiles: { full_name: string | null }[];
}

const SELECT_COLUMNS = "id, profile_id, branch_id, day_of_week, start_time, end_time, profiles (full_name)";

function toShift(row: ShiftRow): Shift {
  return {
    id: row.id,
    profileId: row.profile_id,
    profileFullName: row.profiles[0]?.full_name ?? null,
    branchId: row.branch_id,
    dayOfWeek: row.day_of_week as DayOfWeek,
    // Postgres `time` columns round-trip as "HH:MM:SS" — trim to "HH:MM" to match the domain type.
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
  };
}

export class SupabaseShiftRepository implements ShiftRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async listForBranch(branchId: string): Promise<Result<Shift[]>> {
    const { data, error } = await this.client
      .from("staff_shifts")
      .select(SELECT_COLUMNS)
      .eq("branch_id", branchId)
      .order("day_of_week", { ascending: true })
      .order("start_time", { ascending: true });

    if (error) return err(domainError("LIST_SHIFTS_FAILED", error.message));
    return ok(data.map(toShift));
  }

  async create(input: CreateShiftInput): Promise<Result<Shift>> {
    const { data, error } = await this.client
      .from("staff_shifts")
      .insert({
        profile_id: input.profileId,
        branch_id: input.branchId,
        day_of_week: input.dayOfWeek,
        start_time: input.startTime,
        end_time: input.endTime,
      })
      .select(SELECT_COLUMNS)
      .single();

    if (error) return err(domainError("CREATE_SHIFT_FAILED", error.message));
    return ok(toShift(data));
  }

  async delete(shiftId: string): Promise<Result<void>> {
    const { error } = await this.client.from("staff_shifts").delete().eq("id", shiftId);
    if (error) return err(domainError("DELETE_SHIFT_FAILED", error.message));
    return ok(undefined);
  }
}
