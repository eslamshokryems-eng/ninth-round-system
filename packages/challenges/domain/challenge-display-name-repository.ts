import type { Result } from "@9thround/shared-kernel";
import type { ChallengeDisplayName } from "./challenge-display-name";

export interface ChallengeDisplayNameRepository {
  /** Reads the CALLER's own display name (RLS allows reading any row, but this always filters to the caller — a settings screen never needs anyone else's). Null if never set. */
  getOwn(): Promise<Result<ChallengeDisplayName | null>>;
  /** Upserts the CALLER's own display name — set_challenge_display_name() always forces profile_id = auth.uid() server-side, never a client-supplied id. */
  setOwn(displayName: string): Promise<Result<void>>;
}
