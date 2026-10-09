#!/usr/bin/env bash
# THE NINTH — authorize ONE email as Super Admin of the private demo (no password is ever handled by this script or stored anywhere).
#
#   RACE_ADMIN_EMAIL=owner@example.com RACE_DATABASE_URL='postgresql://…' bash supabase-race/ops/provision_admin.sh
#
# Step 1 (optional, when SUPABASE_SERVICE_ROLE_KEY and RACE_SUPABASE_URL are exported): invites the address through Supabase Auth
#         (the person receives an email and chooses their OWN password; email confirmation stays on). Skip it if the Auth user already
#         exists — create it in Dashboard → Authentication → Users → Add user instead.
# Step 2: promotes the existing account (bootstrap/promote_super_admin.sql) — the flag can only be set by the database owner.
#
# Safe to re-run. Reads everything from the environment; nothing is echoed except the address. Never run against the gym project.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
: "${RACE_ADMIN_EMAIL:?set RACE_ADMIN_EMAIL to the address to authorize}"
: "${RACE_DATABASE_URL:?set RACE_DATABASE_URL (the database URL of the THE NINTH project, taken from your shell, not from a file in the repo)}"
case "$RACE_ADMIN_EMAIL" in *@*.*) ;; *) echo "RACE_ADMIN_EMAIL does not look like an email address" >&2; exit 1;; esac

if [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ] && [ -n "${RACE_SUPABASE_URL:-}" ]; then
  echo "Inviting $RACE_ADMIN_EMAIL through Supabase Auth (they set their own password)…"
  code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$RACE_SUPABASE_URL/auth/v1/invite" \
    -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H 'Content-Type: application/json' \
    --data "$(printf '{"email":"%s"}' "$RACE_ADMIN_EMAIL")")
  case "$code" in
    200) echo "  invitation sent" ;;
    422) echo "  account already exists - continuing" ;;
    *) echo "  invite failed (HTTP $code) - create the user in the dashboard instead" >&2 ;;
  esac
fi

SQL_EMAIL="'$(printf '%s' "$RACE_ADMIN_EMAIL" | sed "s/'/''/g")'"
psql "$RACE_DATABASE_URL" -v ON_ERROR_STOP=1 -v email="$SQL_EMAIL" -f "$HERE/../bootstrap/promote_super_admin.sql"
