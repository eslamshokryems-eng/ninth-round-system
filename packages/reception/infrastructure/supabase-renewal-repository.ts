import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { RenewalRepository } from "../domain/renewal-repository";
import type { RenewMembershipInput, RenewMembershipOutput } from "../domain/renewal";

/** Postgres unique_violation — see supabase/migrations/20260806000003 for which columns this can mean. */
const UNIQUE_VIOLATION = "23505";

export class SupabaseRenewalRepository implements RenewalRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async renew(input: RenewMembershipInput): Promise<Result<RenewMembershipOutput>> {
    const { data, error } = await this.client
      .rpc("renew_membership", {
        p_member_id: input.memberId,
        p_membership_type_id: input.membershipTypeId,
        p_receipt_number: input.receiptNumber,
        p_price: input.price,
        p_discount: input.discount,
        p_payment_method: input.paymentMethod,
        p_notes: input.notes,
        p_coach_id: input.coachId,
        p_session_count: input.sessionCount,
      })
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION && error.message.includes("uq_memberships_receipt_number")) {
        return err(domainError("RECEIPT_NUMBER_TAKEN", "This receipt number has already been used."));
      }
      return err(domainError("RENEWAL_FAILED", error.message));
    }

    // Same supabase-js RPC .single() typing quirk as SupabaseRegistrationRepository.
    const row = data as { membership_id: string; membership_number: string; start_date: string; end_date: string };
    return ok({
      membershipId: row.membership_id,
      membershipNumber: row.membership_number,
      startDate: row.start_date,
      endDate: row.end_date,
    });
  }
}
