import type { Result } from "@9thround/shared-kernel";
import type { CheckInMemberOutput } from "./check-in";

export interface CheckInRepository {
  checkIn(memberId: string): Promise<Result<CheckInMemberOutput>>;
}
