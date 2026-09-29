#!/usr/bin/env bash
# THE NINTH — Phase 3 migration test harness.
#
# Spins up a throwaway Postgres cluster, applies supabase-shim.sql, every
# migration in supabase/migrations (in filename order — the same order the
# Supabase CLI uses), then every tests/*.sql file. Any failed assertion
# raises, which fails the run. Nothing touches a real Supabase project.
#
# Usage: supabase/tests/race/run.sh           (needs Postgres 15+ binaries on PATH or in /usr/lib/postgresql/*/bin)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
export PATH="${PGBIN:+$PGBIN:}$PATH"

WORK="$(mktemp -d)"
PORT="${RACE_TEST_PGPORT:-55439}"
DB=race_test
cleanup() { [ -n "${KEEP:-}" ] && { echo "kept $WORK port $PORT"; return; }; "${RUN_AS[@]}" pg_ctl -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
RUN_AS=()
trap cleanup EXIT

RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 || useradd -m postgres
  chown -R postgres "$WORK"
  RUN_AS=(runuser -u postgres --)
fi

"${RUN_AS[@]}" initdb -D "$WORK/data" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
"${RUN_AS[@]}" pg_ctl -D "$WORK/data" -o "-p $PORT -k $WORK -c timezone=UTC" -l "$WORK/log" start -w >/dev/null

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -d postgres -c "create database $DB" >/dev/null
[ "$("${PSQL[@]}" -d "$DB" -Atc "show server_encoding")" = "UTF8" ] || { echo "harness must run on a UTF8 database (production Supabase is UTF8)"; exit 1; }

apply() { "${PSQL[@]}" -d "$DB" -f "$1" >/dev/null; }
snapshot() { # fingerprint of everything that is NOT race_* — for the regression diff
  "${PSQL[@]}" -d "$DB" -At -f "$HERE/fingerprint.sql" > "$1"
}

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

step "1. Supabase shim"
apply "$HERE/supabase-shim.sql"

step "2. Existing gym migrations"
existing=0
for f in "$ROOT"/supabase/migrations/*.sql; do
  case "$(basename "$f")" in *_race_*) continue ;; esac
  # Production precondition: the founder account already existed when this
  # one-time bootstrap ran. Recreate it (same id) so the migration applies.
  if [ "$(basename "$f")" = "20260809000001_bootstrap_super_admin.sql" ]; then
    "${PSQL[@]}" -d "$DB" -c "insert into auth.users (id, email, raw_user_meta_data) values ('aea7db27-3aaa-4701-aed2-f1b49127bdda', 'founder@test.local', '{\"full_name\":\"Founder\"}')" >/dev/null
  fi
  if [ "$(basename "$f")" = "20260929000001_fix_admin_rpc_null_guards.sql" ]; then
    snapshot "$WORK/pre_fix.sql"
    apply "$f"; existing=$((existing+1))
    snapshot "$WORK/post_fix.sql"
    changed=$( { diff "$WORK/pre_fix.sql" "$WORK/post_fix.sql" || true; } | grep -E '^[<>]' | sed -E 's/^[<>] //; s/ md5=.*//' | sort -u)
    expected=$(printf '%s\n' \
      'fn public.clear_user_permission_override(p_profile_id uuid, p_permission_key text)' \
      'fn public.delete_receipt(p_payment_id uuid, p_reason text)' \
      'fn public.prepare_staff_deletion(p_profile_id uuid)' \
      'fn public.set_role_permission(p_role user_role, p_permission_key text, p_granted boolean)' \
      'fn public.set_user_permission_override(p_profile_id uuid, p_permission_key text, p_granted boolean)' | sort -u)
    if [ "$changed" = "$expected" ]; then
      echo "PASS  security fix 20260929000001 changes exactly 5 functions (guard line + EXECUTE grants) and nothing else"
    else
      echo "FAIL  security fix touched unexpected objects:"; diff <(echo "$expected") <(echo "$changed"); exit 1
    fi
    continue
  fi
  apply "$f"; existing=$((existing+1))
done
echo "applied $existing existing migrations"
snapshot "$WORK/before.sql"

step "3. Race migrations"
race=0
for f in "$ROOT"/supabase/migrations/*_race_*.sql; do
  [ -e "$f" ] || continue
  apply "$f"; race=$((race+1)); echo "  ok  $(basename "$f")"
done
echo "applied $race race migrations"

step "4. Regression: existing (non-race) schema unchanged"
snapshot "$WORK/after.sql"
if diff -u "$WORK/before.sql" "$WORK/after.sql" > "$WORK/schema.diff"; then
  echo "PASS  $(wc -l < "$WORK/before.sql") non-race objects (tables, columns, constraints, indexes, triggers,"
  echo "      policies, function bodies, grants, enum labels, RLS flags, permission rows) identical before/after"
  echo "      additive-only touches on existing objects:"
  "${PSQL[@]}" -d "$DB" -Atc "select '        policy ' || policyname || ' on ' || tablename || ' (' || cmd || ')' from pg_policies where tablename not like 'race\_%' and policyname like 'race %'
                              union all select '        permission row ' || key from permissions where key like 'race.%'
                              union all select '        role grant ' || role || ' -> ' || permission_key from role_permissions where permission_key like 'race.%'"
else
  echo "FAIL  non-race schema changed:"; cat "$WORK/schema.diff"; exit 1
fi

step "5. Test suites"
total=0
"${PSQL[@]}" -d "$DB" -f "$HERE/helpers.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -c "insert into race_test.parity values (\$json\$$(cat "$ROOT/packages/race/domain/parity-cases.json")\$json\$::jsonb)" >/dev/null
node "$ROOT/docs/race/scripts/timing-validation.mjs" --csv > "$WORK/js_schedule.csv"
"${PSQL[@]}" -d "$DB" -c "\\copy race_test.js_schedule from '$WORK/js_schedule.csv' with (format csv)" >/dev/null
for t in "$HERE"/tests/*.sql; do
  echo "-- $(basename "$t")"
  if ! "${PSQL[@]}" -d "$DB" -f "$t" > "$WORK/out" 2>&1; then
    { grep -oE 'PASS  .*' "$WORK/out" || true; }; grep -E 'ERROR|FAIL' "$WORK/out" || true; exit 1
  fi
  grep -oE 'PASS  .*' "$WORK/out" || true
  total=$((total + $(grep -c 'NOTICE:  PASS' "$WORK/out" || true)))
done

echo "== $total assertions passed"

step "5b. Concurrency (parallel sessions)"
source "$HERE/concurrency.sh"

step "6. Rollback safety"
"${PSQL[@]}" -d "$DB" -f "$ROOT/supabase/rollback/20260928_race_phase3_down.sql" 2>&1 | sed -n 's/^NOTICE:  //p'
snapshot "$WORK/rolled_back.sql"
if diff -u "$WORK/before.sql" "$WORK/rolled_back.sql" >/dev/null; then
  echo "PASS  after the rollback script the fingerprint is identical to the pre-race state (with race data present)"
else
  echo "FAIL  rollback left differences"; diff -u "$WORK/before.sql" "$WORK/rolled_back.sql" | head -50; exit 1
fi
left=$("${PSQL[@]}" -d "$DB" -Atc "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'race\_%'")
[ "$left" = "0" ] && echo "PASS  zero race_* relations remain" || { echo "FAIL  $left race_* relations remain"; exit 1; }
step "7. Re-apply race migrations after rollback"
for f in "$ROOT"/supabase/migrations/*_race_*.sql; do apply "$f"; done
echo "PASS  race migrations re-apply cleanly after rollback"

printf '\n\033[1;32mALL RACE MIGRATION TESTS PASSED\033[0m\n'
