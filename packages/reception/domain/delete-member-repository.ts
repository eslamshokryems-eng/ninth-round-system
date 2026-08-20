import type { Result } from "@9thround/shared-kernel";

export interface DeleteMemberRepository {
  delete(memberId: string): Promise<Result<void>>;
}
