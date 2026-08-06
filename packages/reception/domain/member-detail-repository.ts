import type { Result } from "@9thround/shared-kernel";
import type { MemberDetail } from "./member-detail";

export interface MemberDetailRepository {
  getById(memberId: string): Promise<Result<MemberDetail>>;
}
