import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";
import type { TypedSupabaseClient } from "@9thround/supabase-client";
import type { BranchLocation } from "../domain/branch-location";
import type { BranchLocationRepository, SetBranchLocationInput } from "../domain/branch-location-repository";

export class SupabaseBranchLocationRepository implements BranchLocationRepository {
  constructor(private readonly client: TypedSupabaseClient) {}

  async getLocation(branchId: string): Promise<Result<BranchLocation>> {
    const { data, error } = await this.client
      .from("branches")
      .select("id, latitude, longitude, check_in_radius_meters")
      .eq("id", branchId)
      .single();

    if (error) return err(domainError("BRANCH_LOCATION_FETCH_FAILED", error.message));

    return ok({
      branchId: data.id,
      latitude: data.latitude === null ? null : Number(data.latitude),
      longitude: data.longitude === null ? null : Number(data.longitude),
      radiusMeters: data.check_in_radius_meters,
    });
  }

  async setLocation(input: SetBranchLocationInput): Promise<Result<void>> {
    const { error } = await this.client.rpc("set_branch_location", {
      p_branch_id: input.branchId,
      p_latitude: input.latitude,
      p_longitude: input.longitude,
      p_radius_meters: input.radiusMeters,
    });

    if (error) return err(domainError("SET_BRANCH_LOCATION_FAILED", error.message));
    return ok(undefined);
  }
}
