import type { Result, UseCase } from "@9thround/shared-kernel";
import type { PerformanceTargetRepository } from "../domain/performance-target-repository";

export class DeletePerformanceTargetUseCase implements UseCase<string, void> {
  constructor(private readonly targets: PerformanceTargetRepository) {}

  async execute(id: string): Promise<Result<void>> {
    return this.targets.remove(id);
  }
}
