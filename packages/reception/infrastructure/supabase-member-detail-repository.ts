import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { MemberDetailRepository } from "../domain/member-detail-repository";
import type { MemberDetail } from "../domain/member-detail";
import type { PaymentMethod } from "../domain/registration";
import type { MembershipStatus } from "../domain/member-search-result";

interface MembershipHistoryRow {
  id: string;
  membership_number: string;
  start_date: string;
  end_date: string;
  price: number;
  discount: number;
  final_price: number;
  payment_method: PaymentMethod;
  status: MembershipStatus;
  session_count: number | null;
  // Both to-one embeds (the FK is on `memberships`, pointing at
  // membership_types/profiles) — see the comment at the call site for why
  // this is cast rather than trusted from supabase-js's own inference.
  membership_types: { name: string } | null;
  coach: { full_name: string | null } | null;
}

export class SupabaseMemberDetailRepository implements MemberDetailRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getById(memberId: string): Promise<Result<MemberDetail>> {
    const { data, error } = await this.client
      .from("members")
      .select(
        `id, member_code, qr_code, profile_image_url, full_name, phone, email, gender, date_of_birth, national_id,
         emergency_contact_name, emergency_contact_phone, address, notes,
         memberships (
           id, membership_number, start_date, end_date, price, discount, final_price,
           payment_method, status, session_count, membership_types (name), coach:profiles!memberships_coach_id_fkey (full_name)
         )`,
      )
      .eq("id", memberId)
      .order("start_date", { referencedTable: "memberships", ascending: false })
      .maybeSingle();

    if (error) {
      return err(domainError("MEMBER_DETAIL_FAILED", error.message));
    }
    if (!data) {
      return err(domainError("MEMBER_NOT_FOUND", "Member not found."));
    }

    return ok({
      memberId: data.id,
      memberCode: data.member_code,
      qrCode: data.qr_code,
      photoUrl: data.profile_image_url,
      fullName: data.full_name,
      phone: data.phone,
      email: data.email,
      gender: data.gender,
      dateOfBirth: data.date_of_birth,
      nationalId: data.national_id,
      emergencyContactName: data.emergency_contact_name,
      emergencyContactPhone: data.emergency_contact_phone,
      address: data.address,
      notes: data.notes,
      // `membership_types`/`coach`, nested inside each membership row, are
      // both to-one embeds — real PostgREST returns each as a single
      // object, not an array. The previous `[0]` indexing on those objects
      // silently returned undefined for every row — a real production bug
      // (confirmed live on the Expiring page, which had the same bug for
      // `members`), not a harmless defensive pattern. supabase-js's own
      // inferred type here is unreliable (see the cast comment above) —
      // every field resolves to `any` because @9thround/database-types has
      // no `Relationships` metadata for it to key off, so this cast isn't
      // fighting a real type guarantee.
      membershipHistory: (data.memberships as unknown as MembershipHistoryRow[]).map((m) => ({
        membershipId: m.id,
        membershipNumber: m.membership_number,
        membershipTypeName: m.membership_types?.name ?? "—",
        startDate: m.start_date,
        endDate: m.end_date,
        price: m.price,
        discount: m.discount,
        finalPrice: m.final_price,
        paymentMethod: m.payment_method,
        status: m.status,
        coachFullName: m.coach?.full_name ?? null,
        sessionCount: m.session_count,
      })),
    });
  }
}
