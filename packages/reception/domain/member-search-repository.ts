import type { Result } from "@9thround/shared-kernel";
import type { MemberSearchResult } from "./member-search-result";

export interface MemberSearchRepository {
  /** Matches against member code, phone, or full name (case-insensitive, partial). */
  search(query: string): Promise<Result<MemberSearchResult[]>>;
  /** All members, alphabetical, for the browsable Members list — see list-members.ts for the size limit's caveat. */
  list(): Promise<Result<MemberSearchResult[]>>;
  /** Exact match on `members.qr_code` — backs Scan Check-In. `null` (not an error) for a code that doesn't belong to any member (a stale/foreign QR pointed at the camera). */
  findByQrCode(qrCode: string): Promise<Result<MemberSearchResult | null>>;
}
