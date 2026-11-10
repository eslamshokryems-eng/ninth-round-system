#!/usr/bin/env bash
# Repeatable LOCAL-ONLY harness for the audit-log EXECUTE lockdown:
# supabase/migrations/20261111000001_audit_log_function_execute_lockdown.sql
# (H-1: log_audit_event_as callable by anon/authenticated; M-2:
# log_audit_event callable by anon).
#
# Builds a throwaway database, extracts the two audit functions VERBATIM
# from their real migration, proves the PRE-FIX exposure, applies the REAL
# fix migration by relative path, then asserts the post-fix privileges and
# execution behaviour. Neither the functions nor the migration is duplicated
# here, so there is no drift risk between this harness and what ships.
#
# NEVER connects to Supabase or any remote/production database — every
# connection is to a database it creates itself and drops at the end.
#
# Usage: bash run.sh

set -u
cd "$(dirname "${BASH_SOURCE[0]}")"
HARNESS_DIR="$(pwd)"
MIGRATIONS_DIR="$HARNESS_DIR/../../migrations"
AUDIT_MIGRATION="$MIGRATIONS_DIR/20260815000001_audit_log.sql"
FIX_MIGRATION="$MIGRATIONS_DIR/20261111000001_audit_log_function_execute_lockdown.sql"
SCRATCH_DB="${SCRATCH_DB:-audit_log_permissions_harness}"
PG_CLUSTER_VERSION="${PG_CLUSTER_VERSION:-16}"
PG_CLUSTER_NAME="${PG_CLUSTER_NAME:-main}"
LOG_DIR="$HARNESS_DIR/.run-logs"
APPLY_FIX="${APPLY_FIX:-1}"   # set to 0 for the A/B run that withholds the fix

PASS=0
FAIL=0
FAILED_CHECKS=()

if [ -z "${PSQL_SUPERUSER+x}" ]; then
  if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
    PSQL_SUPERUSER="su postgres -c"
  else
    PSQL_SUPERUSER=""
  fi
fi

run_psql() {
  local db="$1" file="$2" logfile="$3"
  if [ -n "$PSQL_SUPERUSER" ]; then
    eval "$PSQL_SUPERUSER \"psql -v ON_ERROR_STOP=1 -d $db -f $file\"" > "$logfile" 2>&1
  else
    psql -v ON_ERROR_STOP=1 -d "$db" -f "$file" > "$logfile" 2>&1
  fi
}

# Same file, but WITHOUT ON_ERROR_STOP — the test file deliberately provokes
# permission errors and must keep going.
run_psql_soft() {
  local db="$1" file="$2" logfile="$3"
  if [ -n "$PSQL_SUPERUSER" ]; then
    eval "$PSQL_SUPERUSER \"psql -d $db -f $file\"" > "$logfile" 2>&1
  else
    psql -d "$db" -f "$file" > "$logfile" 2>&1
  fi
}

# psql prefixes real errors ("psql:<file>:<line>: ERROR: ..."), so an
# anchored ^ERROR never matches one.
has_sql_error() { grep -qi "ERROR:" "$1"; }

createdb_scratch() {
  if [ -n "$PSQL_SUPERUSER" ]; then
    eval "$PSQL_SUPERUSER \"dropdb --if-exists $SCRATCH_DB\"" >/dev/null 2>&1
    eval "$PSQL_SUPERUSER \"createdb $SCRATCH_DB\"" >/dev/null 2>&1
  else
    dropdb --if-exists "$SCRATCH_DB" >/dev/null 2>&1
    createdb "$SCRATCH_DB" >/dev/null 2>&1
  fi
}

dropdb_scratch() {
  if [ -n "$PSQL_SUPERUSER" ]; then
    eval "$PSQL_SUPERUSER \"dropdb --if-exists $SCRATCH_DB\"" >/dev/null 2>&1
  else
    dropdb --if-exists "$SCRATCH_DB" >/dev/null 2>&1
  fi
}

cleanup() { dropdb_scratch; }
trap cleanup EXIT

check() {
  local label="$1" logfile="$2" expected="$3"
  if grep -qF "$expected" "$logfile"; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label"
    echo "        expected to find: $expected"
    echo "        in: $logfile"
    FAIL=$((FAIL + 1))
    FAILED_CHECKS+=("$label")
  fi
}

# Anchored-regex check with an exact expected match count. Needed because
# "permission denied for function log_audit_event" is a prefix of the same
# message for log_audit_event_as, so a fixed-string grep cannot tell the two
# apart and test (8) could pass on test (1)'s output.
check_count_re() {
  local label="$1" logfile="$2" pattern="$3" expected="$4"
  local actual
  actual=$(grep -cE "$pattern" "$logfile")
  if [ "$actual" = "$expected" ]; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label"
    echo "        pattern: $pattern"
    echo "        expected $expected match(es), found $actual, in: $logfile"
    FAIL=$((FAIL + 1))
    FAILED_CHECKS+=("$label")
  fi
}

# Static assertion against a real migration file (no database involved).
check_file() {
  local label="$1" file="$2" pattern="$3"
  if grep -qE "$pattern" "$file"; then
    echo "  PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $label"
    echo "        pattern not found: $pattern"
    echo "        in: $file"
    FAIL=$((FAIL + 1))
    FAILED_CHECKS+=("$label")
  fi
}

echo "=== Prerequisite check ==="
command -v psql >/dev/null 2>&1 || { echo "psql not found — install a local PostgreSQL client/server first."; exit 2; }
[ -f "$AUDIT_MIGRATION" ] || { echo "missing $AUDIT_MIGRATION"; exit 2; }
if command -v pg_lsclusters >/dev/null 2>&1; then
  if ! pg_lsclusters 2>/dev/null | grep -q "^$PG_CLUSTER_VERSION *$PG_CLUSTER_NAME.*online"; then
    echo "Starting local Postgres cluster $PG_CLUSTER_VERSION/$PG_CLUSTER_NAME..."
    pg_ctlcluster "$PG_CLUSTER_VERSION" "$PG_CLUSTER_NAME" start || {
      echo "Could not start the local Postgres cluster."; exit 2; }
  fi
fi

mkdir -p "$LOG_DIR"
rm -f "$LOG_DIR"/*.log "$LOG_DIR"/*.sql

echo "=== Building scratch database: $SCRATCH_DB ==="
createdb_scratch

echo "=== Applying supporting schema ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/00_schema.sql" "$LOG_DIR/00_schema.log"
has_sql_error "$LOG_DIR/00_schema.log" && { echo "  FAIL: 00_schema.sql did not apply cleanly — see $LOG_DIR/00_schema.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: supporting schema applied cleanly"; PASS=$((PASS+1)); }

echo "=== Extracting the two audit functions VERBATIM from the real migration ==="
# Each definition runs from its `create or replace function <name>(` line to
# the terminating `$$;`. Extracting rather than copying keeps this harness
# honest: what is tested is the shipped text.
awk '/^create or replace function log_audit_event\(/{c=1} c{print} c&&/^\$\$;$/{exit}' \
  "$AUDIT_MIGRATION" > "$LOG_DIR/fn_log_audit_event.sql"
awk '/^create or replace function log_audit_event_as\(/{c=1} c{print} c&&/^\$\$;$/{exit}' \
  "$AUDIT_MIGRATION" > "$LOG_DIR/fn_log_audit_event_as.sql"
# Plus the real grant line that 20260815000001 ships for log_audit_event, so
# the PRE-FIX state this harness starts from is exactly production's.
grep -n "^grant execute on function log_audit_event(" "$AUDIT_MIGRATION" | cut -d: -f2- \
  >> "$LOG_DIR/fn_log_audit_event.sql"

for f in fn_log_audit_event fn_log_audit_event_as; do
  lines=$(wc -l < "$LOG_DIR/$f.sql")
  if [ "$lines" -lt 10 ]; then
    echo "  FAIL: extraction of $f produced only $lines lines — the migration's DDL shape may have changed"
    FAIL=$((FAIL+1)); FAILED_CHECKS+=("extract $f")
  else
    echo "  PASS: extracted $f ($lines lines)"
    PASS=$((PASS+1))
  fi
  run_psql "$SCRATCH_DB" "$LOG_DIR/$f.sql" "$LOG_DIR/apply_$f.log"
  has_sql_error "$LOG_DIR/apply_$f.log" && { echo "  FAIL: $f did not apply — see $LOG_DIR/apply_$f.log"; FAIL=$((FAIL+1)); }
done

echo
echo "=== PRE-FIX exposure (what the audit found) ==="
cat > "$LOG_DIR/prefix_probe.sql" <<'PROBE'
select
  case when has_function_privilege('anon','public.log_audit_event_as(uuid,text,text,uuid,jsonb,jsonb,jsonb)','EXECUTE')
       then 'EXPOSED' else 'LOCKED' end as as_anon,
  case when has_function_privilege('authenticated','public.log_audit_event_as(uuid,text,text,uuid,jsonb,jsonb,jsonb)','EXECUTE')
       then 'EXPOSED' else 'LOCKED' end as as_auth,
  case when has_function_privilege('anon','public.log_audit_event(text,text,uuid,jsonb,jsonb,jsonb)','EXECUTE')
       then 'EXPOSED' else 'LOCKED' end as e_anon
\gset
\echo 'PREFIX: log_audit_event_as anon=' :as_anon 'authenticated=' :as_auth '| log_audit_event anon=' :e_anon
PROBE
run_psql_soft "$SCRATCH_DB" "$LOG_DIR/prefix_probe.sql" "$LOG_DIR/prefix.log"
check "PRE-FIX: anon was exposed on log_audit_event_as (H-1)" "$LOG_DIR/prefix.log" "PREFIX: log_audit_event_as anon= EXPOSED"
check "PRE-FIX: authenticated was exposed on log_audit_event_as (H-1)" "$LOG_DIR/prefix.log" "authenticated= EXPOSED"
check "PRE-FIX: anon was exposed on log_audit_event (M-2)" "$LOG_DIR/prefix.log" "log_audit_event anon= EXPOSED"

echo
if [ "$APPLY_FIX" = "1" ]; then
  echo "=== Applying the REAL fix migration (unmodified, by relative path) ==="
  run_psql "$SCRATCH_DB" "$FIX_MIGRATION" "$LOG_DIR/01_fix.log"
  has_sql_error "$LOG_DIR/01_fix.log" && { echo "  FAIL: fix migration did not apply cleanly — see $LOG_DIR/01_fix.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: fix migration applied cleanly"; PASS=$((PASS+1)); }

  echo "=== Re-applying it (idempotency) ==="
  run_psql "$SCRATCH_DB" "$FIX_MIGRATION" "$LOG_DIR/02_fix_again.log"
  has_sql_error "$LOG_DIR/02_fix_again.log" && { echo "  FAIL: fix migration is not idempotent — see $LOG_DIR/02_fix_again.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: fix migration re-applies cleanly (idempotent)"; PASS=$((PASS+1)); }
else
  echo "=== A/B RUN: fix migration deliberately NOT applied ==="
fi

echo "=== Seeding ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/10_seed.sql" "$LOG_DIR/10_seed.log"
has_sql_error "$LOG_DIR/10_seed.log" && { echo "  FAIL: seed did not apply cleanly — see $LOG_DIR/10_seed.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: seed applied cleanly"; PASS=$((PASS+1)); }

echo
echo "=== 20_permissions.sql (ACL + execution, all eight roles) ==="
run_psql_soft "$SCRATCH_DB" "$HARNESS_DIR/20_permissions.sql" "$LOG_DIR/20.log"

# --- ACL tests (14-17) ---
check "(14) PUBLIC retains EXECUTE on neither function" "$LOG_DIR/20.log" "CONFIRM: (14) PUBLIC on log_audit_event_as= NO_PUBLIC_EXECUTE on log_audit_event= NO_PUBLIC_EXECUTE"
check "(15) log_audit_event_as: anon=f authenticated=f service_role=t owner=t" "$LOG_DIR/20.log" "CONFIRM: (15) log_audit_event_as EXECUTE -> anon= f authenticated= f service_role= t postgres= t"
check "(16) log_audit_event: anon=f authenticated=t owner=t" "$LOG_DIR/20.log" "CONFIRM: (16) log_audit_event EXECUTE -> anon= f authenticated= t"
check "(17) no unexpected role inherits log_audit_event_as through PUBLIC" "$LOG_DIR/20.log" "CONFIRM: (17) non-superuser roles besides service_role with EXECUTE on log_audit_event_as= NONE"
check "(17) no unexpected role inherits log_audit_event through PUBLIC" "$LOG_DIR/20.log" "CONFIRM: (17) non-superuser roles besides authenticated with EXECUTE on log_audit_event= NONE"

# --- H-1 execution tests (1-7) ---
check_count_re "(1-5) all five client roles refused on log_audit_event_as (exactly 5)" "$LOG_DIR/20.log" "permission denied for function log_audit_event_as$" 5
check "(6) no forged audit record was inserted" "$LOG_DIR/20.log" "CONFIRM: (6) audit rows carrying a forged_by marker= 0"
check "(6) no forged action reached the audit log" "$LOG_DIR/20.log" "CONFIRM: (6) forged actions present= NONE"
check "(7) service_role CAN still execute log_audit_event_as" "$LOG_DIR/20.log" "CONFIRM: (7) service-role entry written, attributed to= 00000000-0000-0000-0000-000000000001"

# --- M-2 execution tests (8-13) ---
check_count_re "(8) anon refused on log_audit_event itself (end-anchored, not the _as message)" "$LOG_DIR/20.log" "permission denied for function log_audit_event$" 1
check "(8) anon wrote no row" "$LOG_DIR/20.log" "CONFIRM: (8) rows written by anon= 0"
check "(9) authenticated CAN execute log_audit_event" "$LOG_DIR/20.log" "CONFIRM: (9) authenticated direct call wrote a row attributed to= 00000000-0000-0000-0000-000000000004 reception"
check "(10) the membership-registration dependency still works" "$LOG_DIR/20.log" "CONFIRM: (10) security-invoker registration path wrote= create_membership"
check "(11) the membership-renewal dependency still works" "$LOG_DIR/20.log" "CONFIRM: (11) security-invoker renewal path wrote= renew_membership"
check "(12) the record is attributed to the authenticated actor" "$LOG_DIR/20.log" "CONFIRM: (12) attribution of the authenticated write= CORRECTLY_ATTRIBUTED"
check "(13) no unauthorized row reached the audit log" "$LOG_DIR/20.log" "CONFIRM: (13) unauthorized rows in the audit log= NO_UNAUTHORIZED_ROWS"
check "(13) the row-count delta is exactly the legitimate writes" "$LOG_DIR/20.log" "CONFIRM: (13) delta verdict= DELTA_OK"

echo
echo "=== Static checks against the real migrations (no database) ==="
# The membership dependency the authenticated grant exists for. 20_permissions
# exercises it through a security-invoker proxy; these assert the real
# functions genuinely have that shape, so the proxy stands for something.
check_file "register_membership is SECURITY INVOKER in its final definition" \
  "$MIGRATIONS_DIR/20260917000001_membership_sold_by.sql" "^security invoker"
check_file "register_membership calls log_audit_event" \
  "$MIGRATIONS_DIR/20260917000001_membership_sold_by.sql" "perform log_audit_event\("
check_file "renew_membership is defined in the same migration" \
  "$MIGRATIONS_DIR/20260917000001_membership_sold_by.sql" "^create function renew_membership\("
check_file "the fix migration never drops either audit function" \
  "$FIX_MIGRATION" "^revoke execute on function public.log_audit_event_as"
if grep -qE "drop function" "$FIX_MIGRATION"; then
  echo "  FAIL: the fix migration contains a drop function statement"
  FAIL=$((FAIL + 1)); FAILED_CHECKS+=("fix migration drops a function")
else
  echo "  PASS: the fix migration contains no drop function statement"
  PASS=$((PASS + 1))
fi

echo
echo "=============================================="
echo "RESULT: $PASS passed, $FAIL failed"
echo "=============================================="
if [ "$FAIL" -gt 0 ]; then
  echo "Failed checks:"
  for f in "${FAILED_CHECKS[@]}"; do echo "  - $f"; done
  exit 1
fi
exit 0
