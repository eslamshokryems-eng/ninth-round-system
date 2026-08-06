import type { Result, UseCase } from "@9thround/shared-kernel";
import type { MembershipType } from "../domain/membership-type";
import type { MembershipTypesRepository } from "../domain/membership-types-repository";

export class ListMembershipTypesUseCase implements UseCase<Record<string, never>, MembershipType[]> {
  constructor(private readonly membershipTypes: MembershipTypesRepository) {}

  async execute(): Promise<Result<MembershipType[]>> {
    return this.membershipTypes.listActive();
  }
}
