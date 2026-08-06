import { ok } from "@9thround/shared-kernel";
import type { Result, UseCase } from "@9thround/shared-kernel";
import type { MemberSearchResult } from "../domain/member-search-result";
import type { MemberSearchRepository } from "../domain/member-search-repository";

export interface SearchMembersInput {
  query: string;
}

export class SearchMembersUseCase implements UseCase<SearchMembersInput, MemberSearchResult[]> {
  constructor(private readonly members: MemberSearchRepository) {}

  async execute(input: SearchMembersInput): Promise<Result<MemberSearchResult[]>> {
    // An empty/very short query would match everything at the DB level —
    // treat it as "no results yet" rather than a full unscoped table scan.
    if (input.query.trim().length < 2) {
      return ok([]);
    }
    return this.members.search(input.query.trim());
  }
}
