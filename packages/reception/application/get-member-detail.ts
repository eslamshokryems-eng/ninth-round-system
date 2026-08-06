import type { Result, UseCase } from "@9thround/shared-kernel";
import type { MemberDetail } from "../domain/member-detail";
import type { MemberDetailRepository } from "../domain/member-detail-repository";

/** Backs the member detail screen — full profile plus membership history, not just what search returns. */
export class GetMemberDetailUseCase implements UseCase<string, MemberDetail> {
  constructor(private readonly members: MemberDetailRepository) {}

  async execute(memberId: string): Promise<Result<MemberDetail>> {
    return this.members.getById(memberId);
  }
}
