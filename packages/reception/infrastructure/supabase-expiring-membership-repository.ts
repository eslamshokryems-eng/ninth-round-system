import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { ExpiringMembershipRepository } from "../domain/expiring-membership-repository";
import type { ExpiringMembership } from "../domain/expiring-membership";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export class SupabaseExpiringMembershipRepository implements ExpiringMembershipRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async list(branchId: string): Promise<Result<ExpiringMembership[]>> {
    // Matches reception_dashboard_stats' "expiring_this_week" window exactly
    // (current_date through current_date + 6) so this list and that count never disagree.
    const { data, error } = await this.client
      .from("memberships")
      .select("id, member_id, membership_number, end_date, members (full_name, phone)")
      .eq("branch_id", branchId)
      .eq("status", "active")
      .gte("end_date", todayIso())
      .lte("end_date", addDaysIso(6))
      .order("end_date", { ascending: true })
      .limit(100);

    if (error) {
      return err(domainError("LIST_EXPIRING_MEMBERSHIPS_FAILED", error.message));
    }

    return ok(
      data.map((row) => ({
        membershipId: row.id,
        memberId: row.member_id,
        memberFullName: row.members[0]?.full_name ?? "—",
        memberPhone: row.members[0]?.phone ?? "—",
        membershipNumber: row.membership_number,
        endDate: row.end_date,
      })),
    );
  }
}
