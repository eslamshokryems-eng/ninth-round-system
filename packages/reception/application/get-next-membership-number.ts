import type { Result, UseCase } from "@9thround/shared-kernel";
import type { MembershipNumberRepository } from "../domain/membership-number-repository";

// No input: the preview is always "the next one," nothing for the client to pass.
export type GetNextMembershipNumberInput = Record<string, never>;

/** Backs the New Membership form's "we didn't see the ID automatically" preview — see next_membership_number()'s migration comment for why this is an estimate, not a reservation. */
export class GetNextMembershipNumberUseCase implements UseCase<GetNextMembershipNumberInput, string> {
  constructor(private readonly membershipNumbers: MembershipNumberRepository) {}

  async execute(): Promise<Result<string>> {
    return this.membershipNumbers.peekNext();
  }
}
