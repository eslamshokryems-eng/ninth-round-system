import type { Result } from "@9thround/shared-kernel";
import type { TrainerPlayer, TrainerSummary } from "./trainer";

export interface TrainerRepository {
  /** Every coach at the branch, with a count of their currently-assigned (active-membership) players. */
  listTrainers(branchId: string): Promise<Result<TrainerSummary[]>>;
  /** A trainer's currently-assigned players — one row per member whose active membership has this coach_id. */
  listPlayersForTrainer(branchId: string, trainerId: string): Promise<Result<TrainerPlayer[]>>;
}
