import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type {
  CreatePerformanceTargetInput,
  ListPerformanceTargetsInput,
  PerformanceTarget,
  UpdatePerformanceTargetInput,
} from "../domain/performance-target";
import type { PerformanceTargetRepository } from "../domain/performance-target-repository";

const UNIQUE_VIOLATION = "23505";

const SELECT_WITH_STAFF_NAME = "*, staff:staff_id (full_name)";

interface PerformanceTargetRow {
  id: string;
  staff_id: string;
  branch_id: string;
  category: "sales" | "coach";
  period_type: "weekly" | "monthly" | "yearly";
  period_start: string;
  period_end: string;
  target_amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
  staff: { full_name: string | null } | null;
}

function toTarget(row: PerformanceTargetRow): PerformanceTarget {
  return {
    id: row.id,
    staffId: row.staff_id,
    staffName: row.staff?.full_name ?? "—",
    branchId: row.branch_id,
    category: row.category,
    periodType: row.period_type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    targetAmount: Number(row.target_amount),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabasePerformanceTargetRepository implements PerformanceTargetRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async list(input: ListPerformanceTargetsInput): Promise<Result<PerformanceTarget[]>> {
    let query = this.client
      .from("performance_targets")
      .select(SELECT_WITH_STAFF_NAME)
      .eq("branch_id", input.branchId)
      .lte("period_start", input.endDate)
      .gte("period_end", input.startDate)
      .order("period_start", { ascending: false });

    if (input.category) {
      query = query.eq("category", input.category);
    }

    const { data, error } = await query;
    if (error) {
      return err(domainError("LIST_PERFORMANCE_TARGETS_FAILED", error.message));
    }
    return ok((data as unknown as PerformanceTargetRow[]).map(toTarget));
  }

  async create(input: CreatePerformanceTargetInput): Promise<Result<PerformanceTarget>> {
    const { data, error } = await this.client
      .from("performance_targets")
      .insert({
        staff_id: input.staffId,
        branch_id: input.branchId,
        category: input.category,
        period_type: input.periodType,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        target_amount: input.targetAmount,
        notes: input.notes,
      })
      .select(SELECT_WITH_STAFF_NAME)
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        return err(
          domainError("TARGET_ALREADY_EXISTS", "A target for this employee, category, and period already exists."),
        );
      }
      return err(domainError("CREATE_PERFORMANCE_TARGET_FAILED", error.message));
    }
    return ok(toTarget(data as unknown as PerformanceTargetRow));
  }

  async update(input: UpdatePerformanceTargetInput): Promise<Result<PerformanceTarget>> {
    const { data, error } = await this.client
      .from("performance_targets")
      .update({ target_amount: input.targetAmount, notes: input.notes })
      .eq("id", input.id)
      .select(SELECT_WITH_STAFF_NAME)
      .single();

    if (error) {
      return err(domainError("UPDATE_PERFORMANCE_TARGET_FAILED", error.message));
    }
    return ok(toTarget(data as unknown as PerformanceTargetRow));
  }

  async remove(id: string): Promise<Result<void>> {
    const { error } = await this.client.from("performance_targets").delete().eq("id", id);
    if (error) {
      return err(domainError("DELETE_PERFORMANCE_TARGET_FAILED", error.message));
    }
    return ok(undefined);
  }
}
