import type { Result } from "@9thround/shared-kernel";

export interface MembershipNumberRepository {
  /** A non-consuming preview — see supabase/migrations/20260806000009's next_membership_number() comment for why this is an estimate, not a reservation. */
  peekNext(): Promise<Result<string>>;
}
