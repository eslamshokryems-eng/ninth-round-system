import { LeagueError } from "./errors";
import { toPublicDisplayName, validateDisplayName } from "./validation";

export const IMPORT_LIMITS = { maxBytes: 1_000_000, maxRows: 5_000, maxCell: 120 } as const;

export interface ImportRow {
  readonly line: number;
  readonly displayName: string;
  readonly externalRef: string | null;
  /** Always true for an accepted row: a registration without a verified, active membership is refused. */
  readonly membershipVerified: true;
}
export interface ImportIssue {
  readonly line: number;
  readonly message: string;
}
export interface ImportResult {
  readonly rows: readonly ImportRow[];
  readonly issues: readonly ImportIssue[];
}

/** Minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF/LF, BOM. Never evaluates anything. */
export function parseCsv(text: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.length > 1 || (row[0] ?? "") !== "") rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new LeagueError("LEAGUE_INVALID", "The file has an unclosed quote.");
  row.push(cell);
  if (row.length > 1 || (row[0] ?? "") !== "") rows.push(row);
  return rows;
}

const HEADERS = ["display_name", "full_name", "external_member_ref", "membership_verified"] as const;

const identityKey = (displayName: string, externalRef: string | null): string => (externalRef ? `ref:${externalRef.toLowerCase()}` : `name:${displayName.toLowerCase()}`);

function parseBool(v: string): boolean | null {
  const t = v.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(t)) return true;
  if (["no", "n", "false", "0"].includes(t)) return false;
  return null;
}

/** Spreadsheet formulas: a cell that starts like one is refused outright, so nothing imported can ever become a formula when exported again. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Validate a participant CSV. Header: `display_name` OR `full_name` (reduced to "First L."), optional `external_member_ref`, and a REQUIRED `membership_verified` column:
 * staff attest (yes/no) that the member's gym membership was active and verified at registration. A row that is not an explicit yes is refused — nobody is registered on a guess.
 * This is a plain file adapter: nothing here reads the gym database.
 * `existingKeys` are identity keys already in the season (see `participantIdentityKey`) — duplicates against them are reported, never merged.
 */
export function validateParticipantCsv(text: string, existingKeys: ReadonlySet<string> = new Set()): ImportResult {
  if (text.length > IMPORT_LIMITS.maxBytes) throw new LeagueError("LEAGUE_INVALID", "The file is too large (limit 1 MB).");
  if (text.includes("\u0000")) throw new LeagueError("LEAGUE_INVALID", "The file contains binary data and cannot be imported.");
  const table = parseCsv(text);
  const head = table.shift();
  if (!head) throw new LeagueError("LEAGUE_INVALID", "The file is empty.");
  const names = head.map((h) => h.trim().toLowerCase());
  const unknown = names.filter((n) => !(HEADERS as readonly string[]).includes(n));
  if (unknown.length) throw new LeagueError("LEAGUE_INVALID", `Unknown column(s): ${unknown.join(", ")}. Allowed: ${HEADERS.join(", ")}.`);
  if (new Set(names).size !== names.length) throw new LeagueError("LEAGUE_INVALID", "A column appears twice.");
  if (!names.includes("display_name") && !names.includes("full_name")) throw new LeagueError("LEAGUE_INVALID", "The file needs a display_name or full_name column.");
  if (!names.includes("membership_verified")) throw new LeagueError("LEAGUE_INVALID", "The file needs a membership_verified column (yes/no): staff must confirm each member's active membership.");
  if (table.length > IMPORT_LIMITS.maxRows) throw new LeagueError("LEAGUE_INVALID", `Too many rows (limit ${IMPORT_LIMITS.maxRows}).`);

  const col = (r: string[], name: string): string => (r[names.indexOf(name)] ?? "").trim();
  const rows: ImportRow[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Map<string, number>();
  table.forEach((r, idx) => {
    const line = idx + 2;
    if (r.length !== names.length) return void issues.push({ line, message: `Expected ${names.length} columns, found ${r.length}.` });
    for (const cellValue of r) {
      if (cellValue.length > IMPORT_LIMITS.maxCell) return void issues.push({ line, message: "A value is too long." });
      if (FORMULA_START.test(cellValue.trim()) && cellValue.trim() !== "") return void issues.push({ line, message: "A value starts with = + - @ (spreadsheet formula characters) and was refused." });
    }
    try {
      const display = names.includes("display_name") && col(r, "display_name") !== "" ? validateDisplayName(col(r, "display_name")) : toPublicDisplayName(col(r, "full_name"));
      const ref = names.includes("external_member_ref") && col(r, "external_member_ref") !== "" ? col(r, "external_member_ref") : null;
      if (ref !== null && !/^[A-Za-z0-9._:/#-]{1,60}$/.test(ref)) throw new LeagueError("LEAGUE_INVALID", "The member reference may only contain letters, numbers and . _ : / # -");
      const verified = parseBool(col(r, "membership_verified"));
      if (verified === null) throw new LeagueError("LEAGUE_INVALID", "membership_verified must be yes or no.");
      if (!verified) throw new LeagueError("LEAGUE_NOT_ELIGIBLE", "Membership is not verified as active, so this member cannot be registered.");
      const key = identityKey(display, ref);
      if (existingKeys.has(key)) throw new LeagueError("LEAGUE_DUPLICATE", "Already a participant in this season.");
      const firstLine = seen.get(key);
      if (firstLine !== undefined) throw new LeagueError("LEAGUE_DUPLICATE", `Duplicate of line ${firstLine}.`);
      seen.set(key, line);
      rows.push({ line, displayName: display, externalRef: ref, membershipVerified: true });
    } catch (e) {
      issues.push({ line, message: e instanceof LeagueError ? e.message : "Invalid row." });
    }
  });
  return { rows, issues };
}

export const participantIdentityKey = identityKey;
