import type { Result } from "@9thround/shared-kernel";
import type { BranchLocation } from "./branch-location";

export interface SetBranchLocationInput {
  branchId: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface BranchLocationRepository {
  getLocation(branchId: string): Promise<Result<BranchLocation>>;
  setLocation(input: SetBranchLocationInput): Promise<Result<void>>;
}
