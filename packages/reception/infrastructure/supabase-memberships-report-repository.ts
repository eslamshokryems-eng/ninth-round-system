import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { MembershipsReport, MembershipsReportInput, MembershipsReportRow } from "../domain/memberships-report";
import type { MembershipsReportRepository } from "../domain/memberships-report-repository";

interface MembershipRow {
  id: string;
  start_date: string;
  end_date: string;
  final_price: number;
  status: MembershipsReportRow["status"];
  membership_types: { name: string } | null;
  members: { full_name: string; created_at: string } | null;
}

/**
 * "New member" vs "renewal" isn't a stored flag (renew_membership() just
 * inserts another memberships row, same as register_membership() —
 * intentional, see docs/phase-1/14-reception-membership.md) — so this
 * derives it from a real timestamp instead of inventing a classification:
 * a membership counts as this member's first if their account itself was
 * also created within the report's date range.
 */
function isNewMember(memberCreatedAt: string, startDate: string, endDate: string): boolean {
  const created = new Date(memberCreatedAt).getTime();
  return created >= new Date(startDate).getTime() && created <= new Date(`${endDate}T23:59:59.999`).getTime();
}

export class SupabaseMembershipsReportRepository implements MembershipsReportRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getReport(input: MembershipsReportInput): Promise<Result<MembershipsReport>> {
    const { branchId, startDate, endDate } = input;

    const { data, error } = await this.client
      .from("memberships")
      .select(`id, start_date, end_date, final_price, status, membership_types (name), members (full_name, created_at)`)
      .eq("branch_id", branchId)
      .gte("start_date", startDate)
      .lte("start_date", endDate)
      .order("start_date", { ascending: true })
      .limit(5000);

    if (error) {
      return err(domainError("MEMBERSHIPS_REPORT_FAILED", error.message));
    }

    const memberships = data as unknown as MembershipRow[];

    const rows: MembershipsReportRow[] = memberships.map((m) => ({
      membershipId: m.id,
      memberFullName: m.members?.full_name ?? "—",
      membershipTypeName: m.membership_types?.name ?? "—",
      startDate: m.start_date,
      endDate: m.end_date,
      finalPrice: Number(m.final_price),
      status: m.status,
      isNewMember: m.members ? isNewMember(m.members.created_at, startDate, endDate) : false,
    }));

    const byMembershipType = new Map<string, number>();
    const byStatus = new Map<string, number>();
    let newMemberCount = 0;

    for (const row of rows) {
      byMembershipType.set(row.membershipTypeName, (byMembershipType.get(row.membershipTypeName) ?? 0) + 1);
      byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
      if (row.isNewMember) newMemberCount += 1;
    }

    return ok({
      totalMemberships: rows.length,
      newMemberCount,
      renewalCount: rows.length - newMemberCount,
      byMembershipType: [...byMembershipType.entries()].map(([label, count]) => ({ label, count })),
      byStatus: [...byStatus.entries()].map(([label, count]) => ({ label, count })),
      rows,
    });
  }
}
