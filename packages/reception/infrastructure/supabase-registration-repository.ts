import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { RegistrationRepository } from "../domain/registration-repository";
import type { RegisterMembershipInput, RegisterMembershipOutput } from "../domain/registration";

/** Postgres unique_violation — see supabase/migrations/20260806000003 for which columns this can mean. */
const UNIQUE_VIOLATION = "23505";

export class SupabaseRegistrationRepository implements RegistrationRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async register(input: RegisterMembershipInput): Promise<Result<RegisterMembershipOutput>> {
    const { data, error } = await this.client
      .rpc("register_membership", {
        p_branch_id: input.branchId,
        p_full_name: input.fullName,
        p_phone: input.phone,
        p_gender: input.gender,
        p_date_of_birth: input.dateOfBirth,
        p_national_id: input.nationalId,
        p_membership_type_id: input.membershipTypeId,
        p_receipt_number: input.receiptNumber,
        p_price: input.price,
        p_discount: input.discount,
        p_start_date: input.startDate,
        p_payment_method: input.paymentMethod,
        p_notes: input.notes,
        p_address: input.address,
        p_emergency_contact_name: input.emergencyContactName,
        p_emergency_contact_phone: input.emergencyContactPhone,
        p_photo_url: input.photoUrl,
      })
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION && error.message.includes("uq_members_phone")) {
        return err(domainError("PHONE_ALREADY_REGISTERED", "This phone number is already registered."));
      }
      if (error.code === UNIQUE_VIOLATION && error.message.includes("uq_memberships_receipt_number")) {
        return err(domainError("RECEIPT_NUMBER_TAKEN", "This receipt number has already been used."));
      }
      return err(domainError("REGISTRATION_FAILED", error.message));
    }

    // supabase-js's generic inference for a TABLE-returning RPC's .single()
    // result doesn't narrow cleanly against a hand-authored Database type
    // (no issue against a real `supabase gen types` output) — the runtime
    // shape is exactly Fn['Returns'][number], asserted explicitly here.
    const row = data as {
      member_id: string;
      membership_id: string;
      membership_number: string;
      member_qr_code: string;
    };
    return ok({
      memberId: row.member_id,
      membershipId: row.membership_id,
      membershipNumber: row.membership_number,
      memberQrCode: row.member_qr_code,
    });
  }
}
