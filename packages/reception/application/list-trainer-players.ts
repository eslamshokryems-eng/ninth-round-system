import type { Result, UseCase } from "@9thround/shared-kernel";
import type { TrainerPlayer } from "../domain/trainer";
import type { TrainerRepository } from "../domain/trainer-repository";

export interface ListTrainerPlayersInput {
  branchId: string;
  trainerId: string;
}

/** Backs the Trainers page's player table for a selected trainer. */
export class ListTrainerPlayersUseCase implements UseCase<ListTrainerPlayersInput, TrainerPlayer[]> {
  constructor(private readonly trainers: TrainerRepository) {}

  async execute(input: ListTrainerPlayersInput): Promise<Result<TrainerPlayer[]>> {
    return this.trainers.listPlayersForTrainer(input.branchId, input.trainerId);
  }
}
