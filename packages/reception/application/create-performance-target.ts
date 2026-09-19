import type { Result, UseCase } from "@9thround/shared-kernel";
import type { CreatePerformanceTargetInput, PerformanceTarget } from "../domain/performance-target";
import type { PerformanceTargetRepository } from "../domain/performance-target-repository";

export class CreatePerformanceTargetUseCase implements UseCase<CreatePerformanceTargetInput, PerformanceTarget> {
  constructor(private readonly targets: PerformanceTargetRepository) {}

  async execute(input: CreatePerformanceTargetInput): Promise<Result<PerformanceTarget>> {
    return this.targets.create(input);
  }
}
