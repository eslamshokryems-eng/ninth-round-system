import type { Result, UseCase } from "@9thround/shared-kernel";
import type { ListPerformanceTargetsInput, PerformanceTarget } from "../domain/performance-target";
import type { PerformanceTargetRepository } from "../domain/performance-target-repository";

export class ListPerformanceTargetsUseCase implements UseCase<ListPerformanceTargetsInput, PerformanceTarget[]> {
  constructor(private readonly targets: PerformanceTargetRepository) {}

  async execute(input: ListPerformanceTargetsInput): Promise<Result<PerformanceTarget[]>> {
    return this.targets.list(input);
  }
}
