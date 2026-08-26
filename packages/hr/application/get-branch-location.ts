import type { Result, UseCase } from "@9thround/shared-kernel";
import type { BranchLocation } from "../domain/branch-location";
import type { BranchLocationRepository } from "../domain/branch-location-repository";

export class GetBranchLocationUseCase implements UseCase<string, BranchLocation> {
  constructor(private readonly locations: BranchLocationRepository) {}

  async execute(branchId: string): Promise<Result<BranchLocation>> {
    return this.locations.getLocation(branchId);
  }
}
