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

interface ExpiringMembershipRow {
  id: string;
  member_id: string;
  membership_number: string;
  end_date: string;
  // `members` is a to-one embed (see the comment in `list()` below) —
  // supabase-js's own inferred type here has no relation to the actual
  // PostgREST response shape, since @9thround/database-types is
  // hand-authored with no `Relationships` metadata (the thing supabase-js
  // needs to correctly tell a to-one embed from a to-many one); every
  // field it infers resolves to `any`, so casting to this hand-written,
  // correct-by-construction shape is not fighting a real type guarantee.
  members: { full_name: string | null; phone: string | null } | null;
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

    // `members` is a to-one embed (memberships.member_id -> members.id is a
    // FK *on* memberships, i.e. "belongs to" from this query's side) — real
    // PostgREST returns that as a single object, not an array. Indexing
    // `[0]` on that object silently returned undefined for every row — a
    // real production bug (confirmed live on the Expiring page), not just
    // defensive typing.
    return ok(
      (data as unknown as ExpiringMembershipRow[]).map((row) => ({
        membershipId: row.id,
        memberId: row.member_id,
        memberFullName: row.members?.full_name ?? "—",
        memberPhone: row.members?.phone ?? "—",
        membershipNumber: row.membership_number,
        endDate: row.end_date,
      })),
    );
  }
}
