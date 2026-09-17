import type { Result, UseCase } from "@9thround/shared-kernel";
import type { PerformanceTarget, UpdatePerformanceTargetInput } from "../domain/performance-target";
import type { PerformanceTargetRepository } from "../domain/performance-target-repository";

export class UpdatePerformanceTargetUseCase implements UseCase<UpdatePerformanceTargetInput, PerformanceTarget> {
  constructor(private readonly targets: PerformanceTargetRepository) {}

  async execute(input: UpdatePerformanceTargetInput): Promise<Result<PerformanceTarget>> {
    return this.targets.update(input);
  }
}
