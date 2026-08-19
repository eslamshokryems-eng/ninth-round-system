import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { MemberSearchRepository } from "../domain/member-search-repository";
import type { MemberSearchResult, MembershipStatus } from "../domain/member-search-result";

interface MemberSearchRow {
  id: string;
  member_code: string;
  full_name: string;
  phone: string;
  memberships: { status: MembershipStatus; end_date: string | null }[];
}

// RLS's one-active-membership-per-member constraint means at most one
// membership row here has status "active" — that's the one worth
// surfacing; an expired/cancelled history entry isn't what Reception needs
// at a glance in a search result or the members list.
function toSearchResult(row: MemberSearchRow): MemberSearchResult {
  const active = row.memberships.find((m) => m.status === "active");
  return {
    memberId: row.id,
    memberCode: row.member_code,
    fullName: row.full_name,
    phone: row.phone,
    activeMembershipStatus: active?.status ?? null,
    activeMembershipEndDate: active?.end_date ?? null,
  };
}

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
    return ok(data.map(toSearchResult));
  }

  async list(): Promise<Result<MemberSearchResult[]>> {
    // A flat 200-row cap, not real pagination — fine for a single-branch
    // club today; once membership count grows past that, this needs a
    // proper paginated/infinite-scroll list instead of a bigger limit.
    const { data, error } = await this.client
      .from("members")
      .select("id, member_code, full_name, phone, memberships(status, end_date)")
      .order("full_name", { ascending: true })
      .limit(200);

    if (error) {
      return err(domainError("MEMBER_LIST_FAILED", error.message));
    }
    return ok(data.map(toSearchResult));
  }

  async findByQrCode(qrCode: string): Promise<Result<MemberSearchResult | null>> {
    const { data, error } = await this.client
      .from("members")
      .select("id, member_code, full_name, phone, memberships(status, end_date)")
      .eq("qr_code", qrCode)
      .maybeSingle();

    if (error) {
      return err(domainError("MEMBER_LOOKUP_FAILED", error.message));
    }
    return ok(data ? toSearchResult(data) : null);
  }
}
