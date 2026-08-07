import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { CheckInRepository } from "../domain/check-in-repository";
import type { CheckInMemberOutput } from "../domain/check-in";

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
}
