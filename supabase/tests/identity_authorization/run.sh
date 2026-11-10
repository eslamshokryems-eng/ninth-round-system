#!/usr/bin/env bash
# Repeatable LOCAL-ONLY harness for the identity/authorization security
# fix: supabase/migrations/20261107000001_fail_closed_authorization_guards.sql
#
# Builds a throwaway database containing the PRE-FIX definitions
# (00_schema.sql — verbatim copies of the historical migrations), applies
# the REAL fix migration by relative path, seeds, then asserts the Phase D
# regression items. The migration under test is never duplicated here, so
# there is no drift risk between this harness and the actual file.
#
# NEVER connects to Supabase or any remote/production database — every
# connection is to a database it creates itself and drops at the end.
#
# Usage: bash run.sh

set -u
cd "$(dirname "${BASH_SOURCE[0]}")"
HARNESS_DIR="$(pwd)"
MIGRATIONS_DIR="$HARNESS_DIR/../../migrations"
SCRATCH_DB="${SCRATCH_DB:-identity_authorization_harness}"
PG_CLUSTER_VERSION="${PG_CLUSTER_VERSION:-16}"
PG_CLUSTER_NAME="${PG_CLUSTER_NAME:-main}"
LOG_DIR="$HARNESS_DIR/.run-logs"

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

echo "=== Prerequisite check ==="
command -v psql >/dev/null 2>&1 || { echo "psql not found — install a local PostgreSQL client/server first."; exit 2; }
if command -v pg_lsclusters >/dev/null 2>&1; then
  if ! pg_lsclusters 2>/dev/null | grep -q "^$PG_CLUSTER_VERSION *$PG_CLUSTER_NAME.*online"; then
    echo "Starting local Postgres cluster $PG_CLUSTER_VERSION/$PG_CLUSTER_NAME..."
    pg_ctlcluster "$PG_CLUSTER_VERSION" "$PG_CLUSTER_NAME" start || {
      echo "Could not start the local Postgres cluster."; exit 2; }
  fi
fi

mkdir -p "$LOG_DIR"
rm -f "$LOG_DIR"/*.log

echo "=== Building scratch database: $SCRATCH_DB ==="
createdb_scratch

echo "=== Applying PRE-FIX schema (verbatim historical definitions) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/00_schema.sql" "$LOG_DIR/00_schema.log"
has_sql_error "$LOG_DIR/00_schema.log" && { echo "  FAIL: 00_schema.sql did not apply cleanly — see $LOG_DIR/00_schema.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: pre-fix schema applied cleanly"; PASS=$((PASS+1)); }

echo "=== Applying the REAL fix migration (unmodified, by relative path) ==="
run_psql "$SCRATCH_DB" "$MIGRATIONS_DIR/20261107000001_fail_closed_authorization_guards.sql" "$LOG_DIR/01_fix.log"
has_sql_error "$LOG_DIR/01_fix.log" && { echo "  FAIL: fix migration did not apply cleanly — see $LOG_DIR/01_fix.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: fix migration applied cleanly"; PASS=$((PASS+1)); }

echo "=== Seeding ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/10_seed.sql" "$LOG_DIR/10_seed.log"
has_sql_error "$LOG_DIR/10_seed.log" && { echo "  FAIL: seed did not apply cleanly — see $LOG_DIR/10_seed.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: seed applied cleanly"; PASS=$((PASS+1)); }

echo
echo "=== 20_profile_guards.sql (Phase D items 1-11) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/20_profile_guards.sql" "$LOG_DIR/20.log"
check "(1) active non-admin cannot change own role" "$LOG_DIR/20.log" "CONFIRM: (1) role after attempt= reception"
check "(2) active non-admin cannot change own is_active" "$LOG_DIR/20.log" "CONFIRM: (2) is_active after attempt= t"
check "(6) authorized admin CAN deactivate another employee" "$LOG_DIR/20.log" "CONFIRM: Rita deactivated by admin= f"
check "(3) deactivated user cannot reactivate themselves" "$LOG_DIR/20.log" "CONFIRM: (3) is_active after self-reactivation attempt= f"
check "(4) deactivated user cannot promote themselves to super_admin" "$LOG_DIR/20.log" "CONFIRM: (4) role after self-promotion attempt= reception"
check "(5) deactivated user cannot change their own branch" "$LOG_DIR/20.log" "CONFIRM: (5) branch after attempt= 00000000-0000-0000-0000-00000000000b"
check "(4b) combined role+is_active escalation in one statement fails" "$LOG_DIR/20.log" "CONFIRM: (4b) role/is_active after combined attempt= reception/false"
check "(7) authorized admin CAN reactivate another employee" "$LOG_DIR/20.log" "CONFIRM: (7) is_active after admin reactivation= t"
check "(6b) a branch_manager can also deactivate an employee" "$LOG_DIR/20.log" "CONFIRM: (6b) Sally is_active after branch_manager deactivation= f"
check "(8) service-role account creation (role+branch+employee_code) still works" "$LOG_DIR/20.log" "CONFIRM: (8) service-role promotion result= reception/EMP-000099"
check "(9) service-role activation/deactivation still works" "$LOG_DIR/20.log" "CONFIRM: (9) service-role deactivate= f reactivate= t"
check "anon CANNOT execute prepare_staff_deletion" "$LOG_DIR/20.log" "permission denied for function prepare_staff_deletion"
check "deactivated sales employee cannot reassign a lead" "$LOG_DIR/20.log" "CONFIRM: lead assigned_to after deactivated reassignment attempt= 00000000-0000-0000-0000-000000000004"
check "(10) audit rows correctly attributed to the acting admin, none misattributed" "$LOG_DIR/20.log" "CONFIRM: (10) disable_user attributed= t enable_user attributed= t no_misattributed_rows= t"
check "(10b) a service-role write is NOT double-logged by the trigger" "$LOG_DIR/20.log" "CONFIRM: (10b) audit rows for a service-role write before= 1 after= 1"
check "(lead setup) deactivation via service_role actually took effect" "$LOG_DIR/20.log" "CONFIRM: (lead setup) Sally deactivated= f"
check "(11b setup) deactivation via service_role actually took effect" "$LOG_DIR/20.log" "CONFIRM: (11b setup) Mona deactivated via service_role= f"
check "(11) NULL session: every helper returns false, never NULL" "$LOG_DIR/20.log" "is_admin= f is_super_admin= f is_branch_staff= f is_service_role= f"
check "(11b) deactivated staff member resolves to false, not NULL" "$LOG_DIR/20.log" "CONFIRM: (11b) deactivated branch_manager -> is_admin= f is_super_admin= f is_branch_staff= f"

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
