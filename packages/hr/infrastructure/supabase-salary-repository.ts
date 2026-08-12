import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { SalaryRepository, SetSalaryInput } from "../domain/salary-repository";
import type { PayrollEntry, SalaryRecord } from "../domain/salary";

interface SalaryRow {
  id: string;
  profile_id: string;
  branch_id: string;
  monthly_amount: number;
  effective_from: string;
  created_at: string;
}

function toSalaryRecord(row: SalaryRow): SalaryRecord {
  return {
    id: row.id,
    profileId: row.profile_id,
    branchId: row.branch_id,
    monthlyAmount: row.monthly_amount,
    effectiveFrom: row.effective_from,
    createdAt: new Date(row.created_at),
  };
}

export class SupabaseSalaryRepository implements SalaryRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async setSalary(input: SetSalaryInput): Promise<Result<SalaryRecord>> {
    const { data, error } = await this.client
      .from("staff_salaries")
      .insert({
        profile_id: input.profileId,
        branch_id: input.branchId,
        monthly_amount: input.monthlyAmount,
        effective_from: input.effectiveFrom,
      })
      .select("id, profile_id, branch_id, monthly_amount, effective_from, created_at")
      .single();

    if (error) return err(domainError("SET_SALARY_FAILED", error.message));
    return ok(toSalaryRecord(data));
  }

  async listCurrentForBranch(branchId: string): Promise<Result<PayrollEntry[]>> {
    const today = new Date().toISOString().slice(0, 10);
    // No cross-row "latest per profile" aggregate via PostgREST — fetch
    // every not-yet-future salary row for the branch, newest first, and
    // keep only the first (= latest effective_from) occurrence per profile.
    const { data, error } = await this.client
      .from("staff_salaries")
      .select(
        "id, profile_id, branch_id, monthly_amount, effective_from, created_at, profiles (full_name, role)",
      )
      .eq("branch_id", branchId)
      .lte("effective_from", today)
      .order("effective_from", { ascending: false });

    if (error) return err(domainError("LIST_PAYROLL_FAILED", error.message));

    const seenProfiles = new Set<string>();
    const entries: PayrollEntry[] = [];
    for (const row of data) {
      if (seenProfiles.has(row.profile_id)) continue;
      seenProfiles.add(row.profile_id);
      const profile = row.profiles[0];
      entries.push({
        ...toSalaryRecord(row),
        fullName: profile?.full_name ?? null,
        role: profile?.role ?? "—",
      });
    }
    return ok(entries);
  }
}
