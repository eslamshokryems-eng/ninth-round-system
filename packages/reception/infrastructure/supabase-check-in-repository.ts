import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { CheckInRepository } from "../domain/check-in-repository";
import type { CheckInHistoryEntry, CheckInMemberOutput } from "../domain/check-in";

// Most recent 500 visits — a cap, not a "last 500 only" product decision;
// matches this app's other list caps (e.g. members.list(), 200 rows).
// Nothing currently needs more than "how many/when has this member
// attended," and an unbounded query against check_ins (append-only,
// grows forever) would be an unnecessary full-history fetch for that.
const HISTORY_LIMIT = 500;

interface CheckInHistoryRow {
  id: string;
  checked_in_at: string;
  // `checked_in_by` is a to-one embed (the FK is on check_ins, pointing at
  // profiles) — real PostgREST returns a single object, not an array; see
  // supabase-expiring-membership-repository.ts's comment for the full
  // explanation of why this is cast rather than trusted from supabase-js's
  // own (unreliable, `Relationships`-metadata-less) inferred type.
  profiles: { full_name: string | null } | null;
}

export class SupabaseCheckInRepository implements CheckInRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async checkIn(memberId: string): Promise<Result<CheckInMemberOutput>> {
    const { data, error } = await this.client.rpc("check_in_member", { p_member_id: memberId }).single();

    if (error) {
      if (error.message.includes("NO_ACTIVE_MEMBERSHIP")) {
        return err(domainError("NO_ACTIVE_MEMBERSHIP", "This member has no active membership."));
      }
      return err(domainError("CHECK_IN_FAILED", error.message));
    }

    // Same supabase-js RPC .single() typing quirk as the other RPC-backed repositories.
    const row = data as { check_in_id: string; checked_in_at: string };
    return ok({ checkInId: row.check_in_id, checkedInAt: row.checked_in_at });
  }

  async listByMember(memberId: string): Promise<Result<CheckInHistoryEntry[]>> {
    const { data, error } = await this.client
      .from("check_ins")
      .select("id, checked_in_at, profiles:checked_in_by (full_name)")
      .eq("member_id", memberId)
      .order("checked_in_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    if (error) return err(domainError("LIST_CHECK_INS_FAILED", error.message));

    return ok(
      (data as unknown as CheckInHistoryRow[]).map((row) => ({
        checkInId: row.id,
        checkedInAt: new Date(row.checked_in_at),
        checkedInByName: row.profiles?.full_name ?? null,
      })),
    );
  }
}
