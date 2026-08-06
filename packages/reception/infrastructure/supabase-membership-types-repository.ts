import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { MembershipTypesRepository } from "../domain/membership-types-repository";
import type { MembershipType } from "../domain/membership-type";

export class SupabaseMembershipTypesRepository implements MembershipTypesRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async listActive(): Promise<Result<MembershipType[]>> {
    const { data, error } = await this.client
      .from("membership_types")
      .select("id, name, duration_days, price")
      .eq("is_active", true)
      .order("duration_days", { ascending: true });

    if (error) {
      return err(domainError("MEMBERSHIP_TYPES_QUERY_FAILED", error.message));
    }

    return ok(
      data.map((row) => ({
        id: row.id,
        name: row.name,
        durationDays: row.duration_days,
        price: Number(row.price),
      })),
    );
  }
}
