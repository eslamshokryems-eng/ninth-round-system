import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { MemberSearchRepository } from "../domain/member-search-repository";
import type { MemberSearchResult } from "../domain/member-search-result";

export class SupabaseMemberSearchRepository implements MemberSearchRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async search(query: string): Promise<Result<MemberSearchResult[]>> {
    const escaped = query.replace(/[%,]/g, "");
    const { data, error } = await this.client
      .from("members")
      .select("id, member_code, full_name, phone, memberships(status, end_date)")
      .or(`full_name.ilike.%${escaped}%,phone.ilike.%${escaped}%,member_code.ilike.%${escaped}%`)
      .limit(25);

    if (error) {
      return err(domainError("MEMBER_SEARCH_FAILED", error.message));
    }

    return ok(
      data.map((row) => {
        // RLS's one-active-membership-per-member constraint means at most
        // one row here has status "active" — that's the one worth
        // surfacing; an expired/cancelled history entry isn't what
        // Reception needs at a glance in search results.
        const active = row.memberships.find((m) => m.status === "active");
        return {
          memberId: row.id,
          memberCode: row.member_code,
          fullName: row.full_name,
          phone: row.phone,
          activeMembershipStatus: active?.status ?? null,
          activeMembershipEndDate: active?.end_date ?? null,
        };
      }),
    );
  }
}
