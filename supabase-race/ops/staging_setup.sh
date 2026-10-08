#!/usr/bin/env bash
# THE NINTH — STAGING database setup, for the OPERATOR's shell (not run by anyone yet). Stops at the FIRST difference from the expected result.
#
#   export SUPABASE_ACCESS_TOKEN=…   (CLI login / Management API read; revoke after the window)      [from the vault — never commit, never paste in chat]
#   export SUPABASE_DB_PASSWORD=…    (database password of the STAGING project)
#   export RACE_DATABASE_URL=…       (STAGING direct connection string, for psql)
#   export ROSTER_CSV=/secure/roster.csv  SEED_ACTOR_EMAIL=owner@…  EVENT_SLUG=the-ninth-staging EVENT_DATE=2026-12-18 EVENT_NAME='THE NINTH (staging)' \
#          EVENT_VENUE='…' EVENT_FEE=750 EVENT_PLANNED_START='2026-12-18 07:00:00+00'
#   bash supabase-race/ops/staging_setup.sh <EXPECTED-STAGING-PROJECT-REF> [--through=checks|--through=seed]
#
# Steps: 1 link → 2 ref check → 3 migration state before → 4 db push → 5 migration state after → 6 verify_deployment.sql → 7 staging_checks.sql → 8 Auth settings (Management API, read-only)
#        → 9 seed 00..03 (only with --through=seed, only after 1–8 pass).  Nothing here touches the gym project: every command is pinned to the expected ref.
set -euo pipefail
REF="${1:?usage: staging_setup.sh <expected-staging-project-ref> [--through=checks|seed]}"; THROUGH="${2:---through=checks}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; cd "$ROOT/supabase-race"
step() { printf '\n== %s\n' "$*"; }
die() { echo "STOP: $*" >&2; exit 1; }
for v in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD RACE_DATABASE_URL; do [ -n "${!v:-}" ] || die "$v is not set (take it from the vault; never paste it into chat)"; done
[[ "$REF" =~ ^[a-z]{20}$ ]] || die "the expected ref must be the 20-letter project ref"
case "$RACE_DATABASE_URL" in *"$REF"*) ;; *) die "RACE_DATABASE_URL does not contain the expected ref $REF — wrong project?";; esac
LOCAL=$(ls supabase/migrations/*.sql | wc -l); [ "$LOCAL" = "18" ] || die "expected 18 local migrations, found $LOCAL"

step "1. link the CLI to $REF"
supabase link --project-ref "$REF"
step "2. the CLI must report exactly the expected ref"
LINKED=$(cat supabase/.temp/project-ref 2>/dev/null || true)
[ "$LINKED" = "$REF" ] || die "linked ref is '$LINKED', expected '$REF'"
echo "linked ref = $LINKED (matches)"

step "3. connectivity + state BEFORE: the staging database must be reachable over the pooler (IPv4) and be either FRESH (push) or already at the repository's migrations (resume)"
psql "$RACE_DATABASE_URL" -Atc "select 'connected to ' || current_database() || ' as ' || current_user || ' on PostgreSQL ' || current_setting('server_version')" | tr -d '\r' || die "cannot connect with RACE_DATABASE_URL (check the Session pooler URI and password)"
repo_versions() { ls supabase/migrations/*.sql | sed -E 's#.*/([0-9]{14})_.*#\1#' | tr -d '\r' | sort; }
db_versions() { psql "$RACE_DATABASE_URL" -Atc "select version from supabase_migrations.schema_migrations order by version" | tr -d '\r' | sort; }
HAS_HIST=$(psql "$RACE_DATABASE_URL" -Atc "select to_regclass('supabase_migrations.schema_migrations') is not null" | tr -d '\r')
N0=0; [ "$HAS_HIST" = "t" ] && N0=$(psql "$RACE_DATABASE_URL" -Atc "select count(*) from supabase_migrations.schema_migrations" | tr -d '\r')
T0=$(psql "$RACE_DATABASE_URL" -Atc "select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'" | tr -d '\r')
if [ "$N0" = "0" ] && [ "$T0" = "0" ]; then
  echo "OK  fresh project: no migration history, no tables in public"
  step "4. push all $LOCAL migrations (over the pooler: --db-url, because this network has no IPv6)"
  supabase db push --db-url "$RACE_DATABASE_URL"
elif [ "$N0" = "$LOCAL" ] && diff <(db_versions) <(repo_versions) >/dev/null; then
  echo "RESUME: all $LOCAL migrations are already applied and identical to the repository — skipping the push"
else
  die "the staging project is neither fresh nor at the repository's $LOCAL migrations (history rows: $N0, tables in public: $T0)"
fi
step "5. migration state (all $LOCAL applied, history identical to the repository)"
APPLIED=$(psql "$RACE_DATABASE_URL" -Atc "select count(*) from supabase_migrations.schema_migrations" | tr -d '\r')
[ "$APPLIED" = "$LOCAL" ] || die "applied migrations = $APPLIED, expected $LOCAL"
diff <(db_versions) <(repo_versions) || die "migration history differs from the repository"
echo "OK  $APPLIED migrations applied, history identical to the repository"

step "6. verify/verify_deployment.sql"
psql "$RACE_DATABASE_URL" -v ON_ERROR_STOP=1 -f verify/verify_deployment.sql
step "7. ops/staging_checks.sql (tables, functions, RLS, policies, realtime, storage, no gym objects)"
psql "$RACE_DATABASE_URL" -v ON_ERROR_STOP=1 -f ops/staging_checks.sql

step "8. Auth settings (Management API, read-only; if the token cannot read them this becomes a MANUAL checklist and is reported as UNVERIFIED)"
AUTH_BODY="$(mktemp)"; AUTH_CODE=$(curl -sS -o "$AUTH_BODY" -w '%{http_code}' -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "https://api.supabase.com/v1/projects/$REF/config/auth" || true)
if [ "$AUTH_CODE" = "200" ]; then
  PY="$(command -v python3 || command -v python || true)"; [ -n "$PY" ] || die "python is needed for the Auth check (install Python 3)"
  "$PY" -I -c '
import json,sys
c=json.load(open(sys.argv[1])); bad=[]
def chk(name,cond,detail):
    print(("OK   " if cond else "FAIL ")+name+" = "+str(detail))
    if not cond: bad.append(name)
chk("public sign-up disabled", c.get("disable_signup") is True, c.get("disable_signup"))
chk("email confirmation required", c.get("mailer_autoconfirm") is False, c.get("mailer_autoconfirm"))
chk("JWT expiry 3600 s", c.get("jwt_exp")==3600, c.get("jwt_exp"))
chk("password min length >= 12", (c.get("password_min_length") or 0)>=12, c.get("password_min_length"))
print("INFO site_url =", c.get("site_url"), "| uri_allow_list =", c.get("uri_allow_list"))
sys.exit(1 if bad else 0)' "$AUTH_BODY" || die "Auth configuration differs from the expected settings (fix in the dashboard, then re-run)"
  echo "AUTH: VERIFIED by API"
else
  echo "AUTH: UNVERIFIED — the Management API answered HTTP $AUTH_CODE for this token (it cannot read Auth settings)."
  echo "      Check these by hand in the dashboard (Authentication) and confirm before seeding:"
  echo "        [ ] Sign In / Providers → Email → 'Allow new users to sign up' is OFF"
  echo "        [ ] Sign In / Providers → Email → 'Confirm email' is ON"
  echo "        [ ] Sign In / Providers → Email → 'Minimum password length' is 12 or more"
  echo "        [ ] Sessions → JWT expiry is 3600 seconds"
fi
rm -f "$AUTH_BODY"
echo "(SMTP is configured separately and is not checked here.)"
[ "$THROUGH" = "--through=seed" ] || { echo; echo "DONE through step 8 (database verified). Re-run with --through=seed to seed."; exit 0; }

step "9. seed (staging only) — 00 preflight, 01 event, 02 staff, 03 verify"
: "${ROSTER_CSV:?}" "${SEED_ACTOR_EMAIL:?}" "${EVENT_SLUG:?}" "${EVENT_DATE:?}" "${EVENT_NAME:?}"
export ROSTER_CSV
V=(-v ON_ERROR_STOP=1 -v "actor_email=$SEED_ACTOR_EMAIL" -v "event_slug=$EVENT_SLUG" -v "event_date=$EVENT_DATE" -v "event_name=$EVENT_NAME" -v "event_venue=${EVENT_VENUE:-}"
   -v "event_fee=${EVENT_FEE:-0}" -v "event_planned_start=${EVENT_PLANNED_START:-}" -v event_timezone=Africa/Cairo -v target_env=staging)
for f in 00_preflight 01_event 02_staff 03_verify_seed; do echo "-- $f"; psql "$RACE_DATABASE_URL" "${V[@]}" -f "seed/staging/$f.sql"; done
echo "DONE: database verified and seeded."
