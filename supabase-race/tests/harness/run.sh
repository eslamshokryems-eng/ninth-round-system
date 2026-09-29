#!/usr/bin/env bash
# THE NINTH — Phase 3 migration test harness.
#
# Spins up a throwaway Postgres cluster, applies supabase-shim.sql, every
# migration in supabase-race/migrations (in filename order — the same order the
# Supabase CLI uses) to a database with NO gym-management objects, then every tests/*.sql file. Any failed assertion
# raises, which fails the run. Nothing touches a real Supabase project.
#
# Usage: supabase-race/tests/harness/run.sh           (needs Postgres 15+ binaries on PATH or in /usr/lib/postgresql/*/bin)
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

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

step "1. Supabase shim"
apply "$HERE/supabase-shim.sql"

step "2. THE NINTH migrations (its own project — nothing else is applied)"
race=0
for f in "$ROOT"/supabase-race/migrations/*.sql; do
  apply "$f"; race=$((race+1)); echo "  ok  $(basename "$f")"
done
echo "applied $race migrations to a database that contains NO gym-management objects"

step "3. Independence: nothing from any other system exists here, nothing references one"
"${PSQL[@]}" -d "$DB" -f "$HERE/isolation.sql" 2>&1 | sed -n 's/^NOTICE:  //p'

step "5. Test suites"
total=0
"${PSQL[@]}" -d "$DB" -f "$HERE/helpers.sql" >/dev/null
"${PSQL[@]}" -d "$DB" -f "$HERE/simulator.sql" >/dev/null
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

step "6. Restorability: dump the tested database, restore it into a brand-new one, compare"
"${RUN_AS[@]}" pg_dump -h "$WORK" -p "$PORT" -U postgres -d "$DB" --no-owner -Fc -f "$WORK/race.dump"
"${PSQL[@]}" -d postgres -c "create database race_restored" >/dev/null
"${RUN_AS[@]}" pg_restore -h "$WORK" -p "$PORT" -U postgres -d race_restored --no-owner --exit-on-error "$WORK/race.dump" 2>"$WORK/restore.err" || { head -5 "$WORK/restore.err"; echo "FAIL  restore"; exit 1; }
a1=$("${PSQL[@]}" -d "$DB" -At -f "$HERE/restore_fingerprint.sql"); a2=$("${PSQL[@]}" -d race_restored -At -f "$HERE/restore_fingerprint.sql")
if [ "$a1" = "$a2" ]; then echo "PASS  restored database is identical: same row counts in every table and same body for every function"; else echo "FAIL  restored database differs"; diff <(echo "$a1") <(echo "$a2") | head; exit 1; fi
[ "$("${PSQL[@]}" -d race_restored -Atc "select count(*) from race_audit_log")" -gt 0 ] && echo "PASS  the audit history was restored too"

printf '\n\033[1;32mALL RACE MIGRATION TESTS PASSED\033[0m\n'
