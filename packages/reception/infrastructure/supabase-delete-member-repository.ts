import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { DeleteMemberRepository } from "../domain/delete-member-repository";

export class SupabaseDeleteMemberRepository implements DeleteMemberRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async delete(memberId: string): Promise<Result<void>> {
    const { error } = await this.client.rpc("delete_member", { p_member_id: memberId });

    if (error) {
      return err(domainError("DELETE_MEMBER_FAILED", error.message));
    }
    return ok(undefined);
  }
}
