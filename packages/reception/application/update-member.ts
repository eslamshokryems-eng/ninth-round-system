import { domainError, err } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { UpdateMemberInput } from "../domain/update-member";
import type { UpdateMemberRepository } from "../domain/update-member-repository";

/** The member detail screen's "Save" action. Mirrors RegisterMembershipUseCase's validation shape. */
export class UpdateMemberUseCase implements UseCase<UpdateMemberInput, void> {
  constructor(private readonly members: UpdateMemberRepository) {}

  async execute(input: UpdateMemberInput): Promise<Result<void>> {
    if (!input.fullName.trim()) {
      return err(domainError("FULL_NAME_REQUIRED", "Full name is required."));
    }
    if (!input.phone.trim()) {
      return err(domainError("PHONE_REQUIRED", "Phone number is required."));
    }

    return this.members.update(input);
  }
}
