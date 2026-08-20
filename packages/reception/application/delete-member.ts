import type { Result, UseCase } from "@9thround/shared-kernel";
import type { DeleteMemberRepository } from "../domain/delete-member-repository";

/** Member Detail's "Delete Member" action — Branch Manager/Super Admin only (enforced by RLS on delete_member()'s own writes, not restated here). Permanently erases the member and everything tied to them (memberships, payments, check-ins). */
export class DeleteMemberUseCase implements UseCase<string, void> {
  constructor(private readonly members: DeleteMemberRepository) {}

  async execute(memberId: string): Promise<Result<void>> {
    return this.members.delete(memberId);
  }
}
