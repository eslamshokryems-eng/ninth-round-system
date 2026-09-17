import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { AdditionalMembershipRepository } from "../domain/additional-membership-repository";
import type { SellAdditionalMembershipInput, SellAdditionalMembershipOutput } from "../domain/additional-membership";

/** Postgres unique_violation — see supabase/migrations/20260806000003 for which columns this can mean. */
const UNIQUE_VIOLATION = "23505";

export class SupabaseAdditionalMembershipRepository implements AdditionalMembershipRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async sell(input: SellAdditionalMembershipInput): Promise<Result<SellAdditionalMembershipOutput>> {
    const { data, error } = await this.client
      .rpc("sell_additional_membership", {
        p_member_id: input.memberId,
        p_membership_type_id: input.membershipTypeId,
        p_receipt_number: input.receiptNumber,
        p_price: input.price,
        p_discount: input.discount,
        p_start_date: input.startDate,
        p_payment_method: input.paymentMethod,
        p_notes: input.notes,
        p_coach_id: input.coachId,
        p_session_count: input.sessionCount,
        p_program_type: input.programType,
        p_sold_by: input.soldBy,
      })
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION && error.message.includes("uq_memberships_receipt_number")) {
        return err(domainError("RECEIPT_NUMBER_TAKEN", "This receipt number has already been used."));
      }
      if (error.code === UNIQUE_VIOLATION && error.message.includes("uq_memberships_one_active_per_member_type")) {
        return err(
          domainError("ACTIVE_MEMBERSHIP_OF_TYPE_EXISTS", "This member already has an active membership of this type."),
        );
      }
      return err(domainError("SELL_ADDITIONAL_MEMBERSHIP_FAILED", error.message));
    }

    // Same supabase-js RPC .single() typing quirk as SupabaseRenewalRepository.
    const row = data as { membership_id: string; membership_number: string; start_date: string; end_date: string };
    return ok({
      membershipId: row.membership_id,
      membershipNumber: row.membership_number,
      startDate: row.start_date,
      endDate: row.end_date,
    });
  }
}
