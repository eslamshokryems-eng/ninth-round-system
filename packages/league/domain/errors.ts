/** Stable error codes; the database raises the same codes (LEAGUE_*) so a UI can treat both sources alike. */
export type LeagueErrorCode =
  | "LEAGUE_FORBIDDEN"
  | "LEAGUE_NOT_FOUND"
  | "LEAGUE_INVALID"
  | "LEAGUE_INVALID_TRANSITION"
  | "LEAGUE_SEASON_LOCKED"
  | "LEAGUE_CHALLENGE_NOT_OPEN"
  | "LEAGUE_ATTEMPT_LIMIT"
  | "LEAGUE_SELF_REVIEW"
  | "LEAGUE_NOT_ELIGIBLE"
  | "LEAGUE_DUPLICATE"
  | "LEAGUE_REASON_REQUIRED"
  | "LEAGUE_NOT_PUBLISHED"
  | "LEAGUE_UNAVAILABLE";

export class LeagueError extends Error {
  constructor(
    readonly code: LeagueErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LeagueError";
  }
}

const MESSAGES: Record<LeagueErrorCode, string> = {
  LEAGUE_FORBIDDEN: "Your account is not allowed to do that.",
  LEAGUE_NOT_FOUND: "Not found.",
  LEAGUE_INVALID: "That value is not valid.",
  LEAGUE_INVALID_TRANSITION: "That status change is not allowed.",
  LEAGUE_SEASON_LOCKED: "This season is completed — its results are final.",
  LEAGUE_CHALLENGE_NOT_OPEN: "This challenge is not open for attempts.",
  LEAGUE_ATTEMPT_LIMIT: "The attempt limit for this challenge has been reached.",
  LEAGUE_SELF_REVIEW: "You cannot approve a result you recorded yourself.",
  LEAGUE_NOT_ELIGIBLE: "This participant is not eligible for the league.",
  LEAGUE_DUPLICATE: "That already exists.",
  LEAGUE_REASON_REQUIRED: "A reason is required.",
  LEAGUE_NOT_PUBLISHED: "The league is not published yet.",
  LEAGUE_UNAVAILABLE: "The league is not available yet.",
};

export function leagueMessage(code: LeagueErrorCode): string {
  return MESSAGES[code];
}

/** "LEAGUE_X: detail" (Postgres) → the code and a human message. */
export function parseLeagueError(message: string): { code: LeagueErrorCode; message: string } | null {
  const m = /(LEAGUE_[A-Z_]+)/.exec(message);
  if (!m) return null;
  const code = m[1] as LeagueErrorCode;
  if (!(code in MESSAGES)) return null;
  const detail = message.replace(/^.*?LEAGUE_[A-Z_]+:?\s*/, "").trim();
  return { code, message: detail.length > 0 ? detail : MESSAGES[code] };
}
