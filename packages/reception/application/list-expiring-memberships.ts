import type { Result, UseCase } from "@9thround/shared-kernel";
import type { ExpiringMembership } from "../domain/expiring-membership";
import type { ExpiringMembershipRepository } from "../domain/expiring-membership-repository";

export class ListExpiringMembershipsUseCase implements UseCase<string, ExpiringMembership[]> {
  constructor(private readonly memberships: ExpiringMembershipRepository) {}

  async execute(branchId: string): Promise<Result<ExpiringMembership[]>> {
    return this.memberships.list(branchId);
  }
}
