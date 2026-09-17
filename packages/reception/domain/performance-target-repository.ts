import type { Result } from "@9thround/shared-kernel";
import type {
  CreatePerformanceTargetInput,
  ListPerformanceTargetsInput,
  PerformanceTarget,
  UpdatePerformanceTargetInput,
} from "./performance-target";

export interface PerformanceTargetRepository {
  list(input: ListPerformanceTargetsInput): Promise<Result<PerformanceTarget[]>>;
  create(input: CreatePerformanceTargetInput): Promise<Result<PerformanceTarget>>;
  update(input: UpdatePerformanceTargetInput): Promise<Result<PerformanceTarget>>;
  remove(id: string): Promise<Result<void>>;
}
