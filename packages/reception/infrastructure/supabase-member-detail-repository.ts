import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { MemberDetailRepository } from "../domain/member-detail-repository";
import type { MemberDetail } from "../domain/member-detail";

export class SupabaseMemberDetailRepository implements MemberDetailRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getById(memberId: string): Promise<Result<MemberDetail>> {
    const { data, error } = await this.client
      .from("members")
      .select(
        `id, member_code, full_name, phone, email, gender, date_of_birth, national_id,
         emergency_contact_name, emergency_contact_phone, address, notes,
         memberships (
           id, membership_number, start_date, end_date, price, discount, final_price,
           payment_method, status, membership_types (name)
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
      membershipHistory: data.memberships.map((m) => ({
        membershipId: m.id,
        membershipNumber: m.membership_number,
        // Never empty in practice — membership_type_id is `not null` and the FK is never dropped —
        // but the hand-authored types (no Relationships metadata) infer this as an array rather
        // than a single embedded row, so index rather than assert.
        membershipTypeName: m.membership_types[0]?.name ?? "—",
        startDate: m.start_date,
        endDate: m.end_date,
        price: m.price,
        discount: m.discount,
        finalPrice: m.final_price,
        paymentMethod: m.payment_method,
        status: m.status,
      })),
    });
  }
}
