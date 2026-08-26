import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { SetBranchLocationInput } from "../domain/branch-location-repository";
import type { BranchLocationRepository } from "../domain/branch-location-repository";

export class SetBranchLocationUseCase implements UseCase<SetBranchLocationInput, void> {
  constructor(private readonly locations: BranchLocationRepository) {}

  async execute(input: SetBranchLocationInput): Promise<Result<void>> {
    if (input.radiusMeters < 10 || input.radiusMeters > 2000) {
      return err(domainError("INVALID_RADIUS", "Check-in radius must be between 10 and 2000 meters."));
    }
    return this.locations.setLocation(input);
  }
}
