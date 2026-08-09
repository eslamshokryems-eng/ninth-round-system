import type { Result, UseCase } from "@9thround/shared-kernel";
import type { MemberSearchResult } from "../domain/member-search-result";
import type { MemberSearchRepository } from "../domain/member-search-repository";

/** The Members page's default (no query typed yet) view — see MemberSearchRepository.list()'s own comment for the 200-row cap caveat. */
export class ListMembersUseCase implements UseCase<Record<string, never>, MemberSearchResult[]> {
  constructor(private readonly members: MemberSearchRepository) {}

  async execute(): Promise<Result<MemberSearchResult[]>> {
    return this.members.list();
  }
}
