import type { Result, UseCase } from "@9thround/shared-kernel";
import type { TrainerSummary } from "../domain/trainer";
import type { TrainerRepository } from "../domain/trainer-repository";

/** Backs the Trainers page's main list — every coach at the branch with their current player count. */
export class ListTrainersUseCase implements UseCase<string, TrainerSummary[]> {
  constructor(private readonly trainers: TrainerRepository) {}

  async execute(branchId: string): Promise<Result<TrainerSummary[]>> {
    return this.trainers.listTrainers(branchId);
  }
}
