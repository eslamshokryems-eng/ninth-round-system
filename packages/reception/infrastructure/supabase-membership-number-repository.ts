import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { MembershipNumberRepository } from "../domain/membership-number-repository";

export class SupabaseMembershipNumberRepository implements MembershipNumberRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async peekNext(): Promise<Result<string>> {
    const { data, error } = await this.client.rpc("next_membership_number");

    if (error) {
      return err(domainError("PEEK_MEMBERSHIP_NUMBER_FAILED", error.message));
    }
    return ok(data as string);
  }
}
