import { domainError, err, ok } from "@9thround/shared-kernel";
import type { Result } from "@9thround/shared-kernel";

/**
 * One display name per authenticated account, shared across every
 * competition and every season leaderboard — per the approved product
 * clarification, this is account-level, never competition-level. Deliberately
 * its own table (challenge_display_names), not a column on the shared
 * `profiles` table: Challenges owns this fact itself rather than modifying
 * a module outside its own package.
 */
export interface ChallengeDisplayName {
  profileId: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export const MIN_DISPLAY_NAME_LENGTH = 2;
export const MAX_DISPLAY_NAME_LENGTH = 30;

export function validateDisplayName(displayName: string): Result<string> {
  const trimmed = displayName.trim();
  if (trimmed.length < MIN_DISPLAY_NAME_LENGTH || trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return err(
      domainError(
        "INVALID_DISPLAY_NAME",
        `A display name must be between ${MIN_DISPLAY_NAME_LENGTH} and ${MAX_DISPLAY_NAME_LENGTH} characters.`,
      ),
    );
  }
  return ok(trimmed);
}
