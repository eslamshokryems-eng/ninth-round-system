import type { Result } from "@9thround/shared-kernel";
import type { MemberSearchResult } from "./member-search-result";

export interface MemberSearchRepository {
  /** Matches against member code, phone, or full name (case-insensitive, partial). */
  search(query: string): Promise<Result<MemberSearchResult[]>>;
  /** All members, alphabetical, for the browsable Members list — see list-members.ts for the size limit's caveat. */
  list(): Promise<Result<MemberSearchResult[]>>;
}
