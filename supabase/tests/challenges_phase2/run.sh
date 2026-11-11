#!/usr/bin/env bash
# Repeatable LOCAL-ONLY integration test harness for the Challenges
# Phase 2 migration. Builds a throwaway database, applies the REAL
# migrations unmodified (referenced by relative path — never duplicated
# here, so there is no drift risk between this harness and the actual
# migration files), seeds minimal data, runs every numbered *.sql file in
# order, runs the two-session concurrency race, greps every log for the
# specific outcome each step requires, and prints a clear PASS/FAIL
# summary with a non-zero exit code on any failure.
#
# NEVER connects to Supabase or any remote/production database — every
# connection this script makes is to a local database it creates itself
# and drops at the end (and on any early exit, via the trap below).
#
# Prerequisites (see README.md for details):
#   - A local PostgreSQL 16 server (this repo's sandbox already has
#     `postgresql-16`/`postgresql-client-16` installed; most dev
#     machines will need their own local Postgres install).
#   - Ability to start/stop that server and create/drop a database
#     (root + `postgres` OS user via `pg_ctlcluster`/`su postgres`, OR
#     any local setup where the invoking user already has superuser
#     access to a running Postgres — set PSQL_SUPERUSER accordingly).
#
# Usage: bash run.sh

set -u
cd "$(dirname "${BASH_SOURCE[0]}")"
HARNESS_DIR="$(pwd)"
MIGRATIONS_DIR="$HARNESS_DIR/../../migrations"
SCRATCH_DB="${SCRATCH_DB:-challenges_phase2_harness}"
PG_CLUSTER_VERSION="${PG_CLUSTER_VERSION:-16}"
PG_CLUSTER_NAME="${PG_CLUSTER_NAME:-main}"
LOG_DIR="$HARNESS_DIR/.run-logs"

PASS=0
FAIL=0
FAILED_CHECKS=()

# --- psql runner ------------------------------------------------------
# Defaults to `su postgres -c "psql ..."` when running as root with a
# `postgres` OS user available (this sandbox's exact setup) — override
# PSQL_SUPERUSER to any command prefix that gives you a local Postgres
# superuser shell, e.g. PSQL_SUPERUSER="" to just run `psql` directly if
# your own user already has local superuser access.
if [ -z "${PSQL_SUPERUSER+x}" ]; then
  if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
    PSQL_SUPERUSER="su postgres -c"
  else
    PSQL_SUPERUSER=""
  fi
fi

# -v ON_ERROR_STOP=1 by default: a real migration file (00_schema.sql,
# the three Phase migrations, 10_seed.sql) should abort loudly on its
# first real error rather than silently continuing against a now-partial
# schema. Every test file that intentionally exercises negative/rejected
# paths already opens with its own `\set ON_ERROR_STOP off`, which
# overrides this default from that point on within that same file.
run_psql() {
  local db="$1" file="$2" logfile="$3"
  if [ -n "$PSQL_SUPERUSER" ]; then
    eval "$PSQL_SUPERUSER \"psql -v ON_ERROR_STOP=1 -d $db -f $file\"" > "$logfile" 2>&1
  else
    psql -v ON_ERROR_STOP=1 -d "$db" -f "$file" > "$logfile" 2>&1
  fi
}

# grep for a real psql error anywhere on the line — psql's actual error
# output is prefixed ("psql:<file>:<line>: ERROR:  <message>"), so an
# anchored "^ERROR" (this harness's original pattern) never matches it
# and silently treats a genuinely failed migration as clean. Found by
# actually inspecting a migration-apply log that this anchored check had
# wrongly marked PASS, not by inspection of the regex alone.
has_sql_error() {
  grep -qi "ERROR:" "$1"
}

# NOTE: deliberately not a function that `echo`s the child PID back via
# `$(...)` — that runs the whole thing in a subshell, so the background
# job's parent becomes that (already-exited) subshell rather than this
# script, and a later `wait "$PID"` in the main script silently returns
# immediately instead of actually waiting (found by this harness's own
# first run: the race test's log-content checks failed even though the
# logs were correct moments later — the checks had run against
# half-written files because `wait` never really waited). Launched
# inline in the main shell below instead, so `$!` is a true child PID.

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

# KEEP_DB=1 leaves the scratch database in place after the run so it can
# be inspected afterwards (`psql -d challenges_phase2_harness`). Still a
# LOCAL throwaway database either way — it is recreated from scratch on
# every run, so a kept one is overwritten by the next invocation.
cleanup() {
  if [ "${KEEP_DB:-0}" = "1" ]; then
    echo "KEEP_DB=1 — leaving $SCRATCH_DB in place for inspection."
    return
  fi
  dropdb_scratch
}
trap cleanup EXIT

check() {
  # check <label> <logfile> <expected substring>
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

# --- harness-fidelity check ------------------------------------------
# 00_schema.sql hand-copies the four fail-closed helper bodies out of
# 20261107000001 (that migration itself cannot be applied to this
# Challenges-only schema — it also redefines the profiles trigger, the
# lead-assignment trigger and prepare_staff_deletion()'s grants, none of
# which exist here). A hand copy can drift from its source, so compare
# the two texts directly rather than trusting the comment above each one.
assert_helper_matches_migration() {
  # assert_helper_matches_migration <function name> <migration file>
  local fn="$1" mig="$2"
  local from_mig from_harness
  from_mig="$(awk -v fn="$fn" '
    $0 ~ "^create or replace function " fn "\\(\\)$" {grab=1}
    grab {print}
    grab && /^\$\$;$/ {exit}
  ' "$mig")"
  from_harness="$(awk -v fn="$fn" '
    $0 ~ "^create or replace function " fn "\\(\\)$" {grab=1}
    grab {print}
    grab && /^\$\$;$/ {exit}
  ' "$HARNESS_DIR/00_schema.sql")"
  if [ -z "$from_mig" ] || [ -z "$from_harness" ]; then
    echo "  FAIL: could not extract $fn() from both the migration and 00_schema.sql"
    FAIL=$((FAIL + 1)); FAILED_CHECKS+=("harness copy of $fn() not extractable"); return
  fi
  if [ "$from_mig" = "$from_harness" ]; then
    echo "  PASS: 00_schema.sql's $fn() is byte-identical to $(basename "$mig")"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: 00_schema.sql's $fn() has DRIFTED from $(basename "$mig")"
    diff <(printf '%s\n' "$from_mig") <(printf '%s\n' "$from_harness") | sed 's/^/        /'
    FAIL=$((FAIL + 1)); FAILED_CHECKS+=("harness copy of $fn() drifted")
  fi
}

echo "=== Prerequisite check ==="
command -v psql >/dev/null 2>&1 || { echo "psql not found — install a local PostgreSQL client/server first. See README.md."; exit 2; }

if command -v pg_lsclusters >/dev/null 2>&1; then
  if ! pg_lsclusters 2>/dev/null | grep -q "^$PG_CLUSTER_VERSION *$PG_CLUSTER_NAME.*online"; then
    echo "Starting local Postgres cluster $PG_CLUSTER_VERSION/$PG_CLUSTER_NAME..."
    pg_ctlcluster "$PG_CLUSTER_VERSION" "$PG_CLUSTER_NAME" start || {
      echo "Could not start the local Postgres cluster. Start it yourself and re-run, or set PSQL_SUPERUSER to point at an already-running instance.";
      exit 2;
    }
  fi
fi

mkdir -p "$LOG_DIR"
rm -f "$LOG_DIR"/*.log

echo "=== Building scratch database: $SCRATCH_DB ==="
createdb_scratch

echo "=== Applying harness schema ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/00_schema.sql" "$LOG_DIR/00_schema.log"
check "harness schema applies with no errors" "$LOG_DIR/00_schema.log" "CREATE FUNCTION"
has_sql_error "$LOG_DIR/00_schema.log" && { echo "  FAIL: unexpected error in 00_schema.sql — see $LOG_DIR/00_schema.log"; FAIL=$((FAIL+1)); }

echo "=== Applying the REAL Phase 1 migration (unmodified, by relative path) ==="
run_psql "$SCRATCH_DB" "$MIGRATIONS_DIR/20261105000001_challenges_foundation.sql" "$LOG_DIR/01_phase1.log"
has_sql_error "$LOG_DIR/01_phase1.log" && { echo "  FAIL: Phase 1 migration did not apply cleanly — see $LOG_DIR/01_phase1.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: Phase 1 migration applied cleanly"; PASS=$((PASS+1)); }

echo "=== Applying the REAL Phase 2 migration (unmodified, by relative path) ==="
run_psql "$SCRATCH_DB" "$MIGRATIONS_DIR/20261105000002_challenges_rls_and_rpcs.sql" "$LOG_DIR/02_phase2.log"
has_sql_error "$LOG_DIR/02_phase2.log" && { echo "  FAIL: Phase 2 migration did not apply cleanly — see $LOG_DIR/02_phase2.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: Phase 2 migration applied cleanly"; PASS=$((PASS+1)); }

run_psql "$SCRATCH_DB" "$MIGRATIONS_DIR/20261106000000_challenge_scope_multi_branch_value.sql" "$LOG_DIR/03_scope_enum.log"
has_sql_error "$LOG_DIR/03_scope_enum.log" && { echo "  FAIL: scope enum migration did not apply"; FAIL=$((FAIL+1)); }
echo "=== Applying the REAL Phase 3 migration (unmodified, by relative path) ==="
run_psql "$SCRATCH_DB" "$MIGRATIONS_DIR/20261106000001_challenges_mvp_membership_independence.sql" "$LOG_DIR/03_phase3.log"
has_sql_error "$LOG_DIR/03_phase3.log" && { echo "  FAIL: Phase 3 migration did not apply cleanly — see $LOG_DIR/03_phase3.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: Phase 3 migration applied cleanly"; PASS=$((PASS+1)); }

# 20261107000001_fail_closed_authorization_guards.sql is deliberately NOT
# applied here: it also redefines the profiles trigger, the lead-assignment
# trigger and prepare_staff_deletion()'s grants, none of which exist in this
# Challenges-only schema. Its helper fixes are reproduced in 00_schema.sql
# instead, and the migration itself is executed verbatim by
# supabase/tests/identity_authorization/run.sh.
echo "=== Harness fidelity: hand-copied helpers vs. 20261107000001 ==="
assert_helper_matches_migration is_admin        "$MIGRATIONS_DIR/20261107000001_fail_closed_authorization_guards.sql"
assert_helper_matches_migration is_super_admin  "$MIGRATIONS_DIR/20261107000001_fail_closed_authorization_guards.sql"
assert_helper_matches_migration is_service_role "$MIGRATIONS_DIR/20261107000001_fail_closed_authorization_guards.sql"

echo "=== Applying the REAL active-coach submission migration (unmodified, by relative path) ==="
run_psql "$SCRATCH_DB" "$MIGRATIONS_DIR/20261108000001_submit_result_requires_active_authorized_coach.sql" "$LOG_DIR/05_activecoach.log"
has_sql_error "$LOG_DIR/05_activecoach.log" && { echo "  FAIL: active-coach migration did not apply cleanly — see $LOG_DIR/05_activecoach.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: active-coach submission migration applied cleanly"; PASS=$((PASS+1)); }

echo "=== Applying the REAL correction/designation active-coach migration (unmodified, by relative path) ==="
run_psql "$SCRATCH_DB" "$MIGRATIONS_DIR/20261109000001_correction_and_designation_require_active_coach.sql" "$LOG_DIR/06_activedesig.log"
has_sql_error "$LOG_DIR/06_activedesig.log" && { echo "  FAIL: correction/designation migration did not apply cleanly — see $LOG_DIR/06_activedesig.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: correction/designation active-coach migration applied cleanly"; PASS=$((PASS+1)); }

echo "=== Applying the REAL GLOBAL-review authorization migration (unmodified, by relative path) ==="
run_psql "$SCRATCH_DB" "$MIGRATIONS_DIR/20261110000001_global_review_requires_manager_or_admin.sql" "$LOG_DIR/07_globalreview.log"
has_sql_error "$LOG_DIR/07_globalreview.log" && { echo "  FAIL: GLOBAL-review migration did not apply cleanly — see $LOG_DIR/07_globalreview.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: GLOBAL-review authorization migration applied cleanly"; PASS=$((PASS+1)); }

echo "=== Applying the REAL display-name uniqueness migration (unmodified, by relative path) ==="
run_psql "$SCRATCH_DB" "$MIGRATIONS_DIR/20261112000001_display_name_uniqueness_and_reserved_staff_names.sql" "$LOG_DIR/08_displayname.log"
has_sql_error "$LOG_DIR/08_displayname.log" && { echo "  FAIL: display-name migration did not apply cleanly — see $LOG_DIR/08_displayname.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: display-name uniqueness migration applied cleanly"; PASS=$((PASS+1)); }

# APPLY_L1L2=0 withholds the L-1/L-2 hardening migration so the 103 suite
# can be run as an A/B negative control — the same tests then show the
# PRE-fix behaviour (an unauthenticated caller refused with the
# display-name message, a coach entering a competition, and an unpinned
# search_path on is_super_admin) instead of the post-fix behaviour.
APPLY_L1L2="${APPLY_L1L2:-1}"
if [ "$APPLY_L1L2" = "1" ]; then
  echo "=== Applying the REAL identity-hardening / member-only-participation migration (unmodified, by relative path) ==="
  run_psql "$SCRATCH_DB" "$MIGRATIONS_DIR/20261113000001_identity_hardening_and_member_only_participation.sql" "$LOG_DIR/09_identityhardening.log"
  has_sql_error "$LOG_DIR/09_identityhardening.log" && { echo "  FAIL: identity-hardening migration did not apply cleanly — see $LOG_DIR/09_identityhardening.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: identity-hardening migration applied cleanly"; PASS=$((PASS+1)); }
else
  echo "=== APPLY_L1L2=0 — WITHHOLDING the identity-hardening migration (A/B negative control) ==="
fi

echo "=== Applying the REAL result audit-trail migration (unmodified, by relative path) ==="
run_psql "$SCRATCH_DB" "$MIGRATIONS_DIR/20261117000001_challenge_result_audit_trail.sql" "$LOG_DIR/09b_audittrail.log"
has_sql_error "$LOG_DIR/09b_audittrail.log" && { echo "  FAIL: audit-trail migration did not apply cleanly — see $LOG_DIR/09b_audittrail.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: audit-trail migration applied cleanly (its triggers now fire during every test below)"; PASS=$((PASS+1)); }

echo "=== Seeding test data ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/10_seed.sql" "$LOG_DIR/10_seed.log"
has_sql_error "$LOG_DIR/10_seed.log" && { echo "  FAIL: seed did not apply cleanly — see $LOG_DIR/10_seed.log"; FAIL=$((FAIL+1)); } || { echo "  PASS: seed applied cleanly"; PASS=$((PASS+1)); }

echo
echo "=== 20_privileges.sql (internal-helper lockdown + action-RPC grant) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/20_privileges.sql" "$LOG_DIR/20.log"
check "authenticated denied recompute_challenge_points" "$LOG_DIR/20.log" "permission denied for function recompute_challenge_points"
check "anon denied recompute_challenge_points" "$LOG_DIR/20.log" "permission denied for function recompute_challenge_points"
check "positive control: authenticated CAN call set_challenge_display_name" "$LOG_DIR/20.log" "CONFIRM: display name set= Privilege Test"
check "anon denied set_challenge_display_name" "$LOG_DIR/20.log" "permission denied for function set_challenge_display_name"

echo
echo "=== 30_seasons_and_settings.sql (L-1 action-RPC grants) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/30_seasons_and_settings.sql" "$LOG_DIR/30.log"
check "non-super-admin cannot create a season" "$LOG_DIR/30.log" "Only a super admin can create a competition season."
check "non-super-admin cannot change the weight range" "$LOG_DIR/30.log" "Only a super admin can change the competition weight range."
check "weight range set to 15 by super_admin" "$LOG_DIR/30.log" "CONFIRM: max_weight= 15"
check "weight range unchanged by rejected branch_manager attempt" "$LOG_DIR/30.log" "CONFIRM: max_weight still= 15"

echo
echo "=== 40_create_challenge.sql (eligibility-rule validation / weight range / branch isolation across all 3 scopes) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/40_create_challenge.sql" "$LOG_DIR/40.log"
check "unsupported (membership-based) eligibility rule type rejected at creation" "$LOG_DIR/40.log" "Unsupported eligibility rule type: active_membership"
check "invalid age value rejected at creation, not a raw cast crash" "$LOG_DIR/40.log" "must be a non-negative integer"
check "out-of-range weight names the actual configured range" "$LOG_DIR/40.log" "Competition weight must be between 1 and 15"
check "branch isolation: branch_manager cannot create GLOBAL" "$LOG_DIR/40.log" "A branch manager can only create a branch-scoped competition for their own branch."
check "branch isolation: branch_manager cannot create MULTI_BRANCH" "$LOG_DIR/40.log" "A branch manager can only create a branch-scoped competition for their own branch."
check "MULTI_BRANCH with an empty branch list rejected even for super_admin" "$LOG_DIR/40.log" "A multi-branch competition must list at least one eligible branch."
check "super_admin creates a valid GLOBAL challenge" "$LOG_DIR/40.log" "CONFIRM: global challenge created"
check "super_admin creates a valid MULTI_BRANCH challenge spanning both branches" "$LOG_DIR/40.log" "CONFIRM: challenge_branches row count= 2"

echo
echo "=== 45_registration_and_branch_selection.sql (customer self-service identity/branch/display-name/age model) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/45_registration_and_branch_selection.sql" "$LOG_DIR/45.log"
check "registration blocked before a display name is set" "$LOG_DIR/45.log" "Set a display name before requesting to join a competition."
check "GLOBAL: non-null branchId rejected" "$LOG_DIR/45.log" "This competition has no branch to select"
check "BRANCH: null branchId rejected" "$LOG_DIR/45.log" "This competition is only open to its own branch."
check "BRANCH: wrong branchId rejected" "$LOG_DIR/45.log" "This competition is only open to its own branch."
check "MULTI_BRANCH: branch not in the challenge's list rejected" "$LOG_DIR/45.log" "This competition is not open to the selected branch."
check "MULTI_BRANCH: null branchId rejected" "$LOG_DIR/45.log" "This competition is not open to the selected branch."
check "MULTI_BRANCH: valid branch-list branch succeeds" "$LOG_DIR/45.log" "CONFIRM: multi-branch registration succeeded, branch_id= 00000000-0000-0000-0000-00000000000c"
check "GLOBAL: null branchId succeeds" "$LOG_DIR/45.log" "status= approved"
check "Alex's branch registration auto-approved" "$LOG_DIR/45.log" "CONFIRM: Alex's participant status= approved branch_id= 00000000-0000-0000-0000-00000000000b"
check "duplicate registration for the same challenge rejected" "$LOG_DIR/45.log" "A participation request already exists for this competition."
check "age eligibility: minor auto-rejected with a clear reason" "$LOG_DIR/45.log" "Minimum age is 18."
check "age eligibility: missing date of birth auto-rejected with a clear reason" "$LOG_DIR/45.log" "Date of birth is required to check age eligibility."

echo
echo "=== 50_lifecycle_and_submission.sql (H-1 + coach auth + duplicate-original guard, customer/designation model) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/50_lifecycle_and_submission.sql" "$LOG_DIR/50.log"
check "H-1: non-active challenge blocks submission" "$LOG_DIR/50.log" "not while it is registration_open"
check "submit before any coach is designated is rejected" "$LOG_DIR/50.log" "No coach has been designated for this participant yet."
check "coach auth: wrong coach rejected" "$LOG_DIR/50.log" "Only this participant's designated coach may submit a result for them."
check "NEW GUARD: duplicate pending original rejected" "$LOG_DIR/50.log" "already has a result for this competition"
check "rejection recorded" "$LOG_DIR/50.log" "CONFIRM: result A status= rejected"
check "REQUIREMENT: resubmission after rejection succeeds" "$LOG_DIR/50.log" "CONFIRM: resubmission after rejection succeeded"
check "approval recorded" "$LOG_DIR/50.log" "CONFIRM: result B status= approved"
check "NEW GUARD: duplicate original rejected once an approved result exists" "$LOG_DIR/50.log" "already has a result for this competition"
check "REQUIREMENT: correction workflow still works after approval" "$LOG_DIR/50.log" "CONFIRM: correction request succeeded"
check "correction approval supersedes the original" "$LOG_DIR/50.log" "CONFIRM: correction status= approved"

echo
echo "=== 60_review_and_corrections.sql (self-review ban on corrections, designation reason requirement, atomic recompute) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/60_review_and_corrections.sql" "$LOG_DIR/60.log"
check "self-review ban fires for a correction's own author" "$LOG_DIR/60.log" "You cannot approve your own correction request."
check "designation reason required" "$LOG_DIR/60.log" "A reason is required to designate or change a participant's assigned coach."
check "reassignment succeeds and is audit-logged with the reason" "$LOG_DIR/60.log" "Coach One is on leave; reassigning to Coach Two."
check "reassignment actually takes effect" "$LOG_DIR/60.log" "CONFIRM: designated coach after reassignment= 00000000-0000-0000-0000-000000000004"
check "atomic recompute reaches every participant" "$LOG_DIR/60.log" "CONFIRM: distinct participants with ledger entries= 2"

echo
echo "=== 70_cross_branch_coach_designation.sql (participant-branch-scoped designation, incl. branchless/GLOBAL carve-out) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/70_cross_branch_coach_designation.sql" "$LOG_DIR/70.log"
check "(A) cross-branch coach rejected for same-branch caller" "$LOG_DIR/70.log" "The designated coach must belong to the same branch as the participant."
check "(B) cross-branch caller rejected" "$LOG_DIR/70.log" "Only a branch manager or super admin for this participant's branch may designate a coach for this participant."
check "(C) super_admin cannot bypass the coach-branch check" "$LOG_DIR/70.log" "The designated coach must belong to the same branch as the participant."
check "(D) authorized same-branch designation by branch_manager succeeds" "$LOG_DIR/70.log" "CONFIRM: designated_coach_id= 00000000-0000-0000-0000-000000000003"
check "(E) authorized same-branch designation by super_admin succeeds" "$LOG_DIR/70.log" "CONFIRM: designated_coach_id= 00000000-0000-0000-0000-000000000004"
check "(F) branch_manager cannot designate a coach for a branchless (GLOBAL) participant" "$LOG_DIR/70.log" "Only a super admin may designate a coach for a participant with no selected branch."
check "(G) super_admin CAN designate a coach for a branchless (GLOBAL) participant" "$LOG_DIR/70.log" "CONFIRM: designated_coach_id= 00000000-0000-0000-0000-000000000003"

echo
echo "=== M-3 concurrency race (two genuinely concurrent sessions) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/80_concurrency_setup.sql" "$LOG_DIR/80.log"
RACE_RESULT_ID=$(grep "RACE_TARGET_RESULT_ID=" "$LOG_DIR/80.log" | sed 's/.*RACE_TARGET_RESULT_ID= *//' | tr -d ' ')
if [ -z "$RACE_RESULT_ID" ]; then
  echo "  FAIL: could not determine race target result id — see $LOG_DIR/80.log"
  FAIL=$((FAIL + 1))
else
  sed "s/__RESULT_ID__/$RACE_RESULT_ID/" "$HARNESS_DIR/81_race_session_a.sql.template" > "$LOG_DIR/81_race_session_a.sql"
  sed "s/__RESULT_ID__/$RACE_RESULT_ID/" "$HARNESS_DIR/82_race_session_b.sql.template" > "$LOG_DIR/82_race_session_b.sql"

  if [ -n "$PSQL_SUPERUSER" ]; then
    eval "$PSQL_SUPERUSER \"psql -d $SCRATCH_DB -f $LOG_DIR/81_race_session_a.sql\"" > "$LOG_DIR/81_a.log" 2>&1 &
  else
    psql -d "$SCRATCH_DB" -f "$LOG_DIR/81_race_session_a.sql" > "$LOG_DIR/81_a.log" 2>&1 &
  fi
  A_PID=$!
  sleep 0.5
  if [ -n "$PSQL_SUPERUSER" ]; then
    eval "$PSQL_SUPERUSER \"psql -d $SCRATCH_DB -f $LOG_DIR/82_race_session_b.sql\"" > "$LOG_DIR/82_b.log" 2>&1 &
  else
    psql -d "$SCRATCH_DB" -f "$LOG_DIR/82_race_session_b.sql" > "$LOG_DIR/82_b.log" 2>&1 &
  fi
  B_PID=$!
  wait "$A_PID"
  wait "$B_PID"

  check "M-3: session A's approval succeeded" "$LOG_DIR/81_a.log" "COMMIT"
  check "M-3: session B blocked and then correctly rejected the stale attempt" "$LOG_DIR/82_b.log" "Only a pending result can be approved."

  if [ -n "$PSQL_SUPERUSER" ]; then
    eval "$PSQL_SUPERUSER \"psql -d $SCRATCH_DB -c \\\"select count(*) from challenge_result_reviews where result_id = '$RACE_RESULT_ID';\\\"\"" > "$LOG_DIR/83_review_count.log" 2>&1
  else
    psql -d "$SCRATCH_DB" -c "select count(*) from challenge_result_reviews where result_id = '$RACE_RESULT_ID';" > "$LOG_DIR/83_review_count.log" 2>&1
  fi
  check "M-3: exactly one review row exists (no duplicate from the race)" "$LOG_DIR/83_review_count.log" "1"
fi

echo
echo "=== 95_leaderboards_and_rls.sql (public leaderboard views + broadened RLS, queried as a genuinely low-privilege customer) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/95_leaderboards_and_rls.sql" "$LOG_DIR/95.log"
check "FINDING 2: others' raw participant records HIDDEN from an ordinary customer" "$LOG_DIR/95.log" "CONFIRM: others_participants_to_casey= HIDDEN"
check "FINDING 2: a participant CAN read her own participant record" "$LOG_DIR/95.log" "CONFIRM: own_participation_to_casey= VISIBLE"
check "FINDING 2: a REJECTED participant's record does not leak to another customer" "$LOG_DIR/95.log" "CONFIRM: rejected_participation_to_customer= HIDDEN"
check "FINDING 2: staff IN SCOPE can read participant records" "$LOG_DIR/95.log" "CONFIRM: participants_to_in_scope_staff= VISIBLE"
check "FINDING 2: staff OUT OF SCOPE cannot read this branch's participant records" "$LOG_DIR/95.log" "CONFIRM: participants_to_out_of_scope_staff= HIDDEN"
check "FINDING 2: others' raw ledger entries HIDDEN from an ordinary customer" "$LOG_DIR/95.log" "CONFIRM: others_ledger_to_casey= HIDDEN"
check "FINDING 2: a participant CAN read her own raw ledger entries" "$LOG_DIR/95.log" "CONFIRM: own_ledger_to_alex= VISIBLE"
check "FINDING 2: staff IN SCOPE can read raw ledger entries" "$LOG_DIR/95.log" "CONFIRM: ledger_to_in_scope_staff= VISIBLE"
check "FINDING 2: staff OUT OF SCOPE cannot read raw ledger entries" "$LOG_DIR/95.log" "CONFIRM: ledger_to_out_of_scope_staff= HIDDEN"
check "FINDING 2: challenge_leaderboard still serves OTHER participants to a customer" "$LOG_DIR/95.log" "CONFIRM: leaderboard_breadth= MULTI"
check "FINDING 2: season overall leaderboard still serves OTHER participants" "$LOG_DIR/95.log" "CONFIRM: season_overall_breadth= MULTI"
check "FINDING 2: season by-branch leaderboard still serves OTHER participants" "$LOG_DIR/95.log" "CONFIRM: season_branch_breadth= MULTI"
check "FINDING 2: the probing customer genuinely has no leaderboard row of her own" "$LOG_DIR/95.log" "CONFIRM: casey_own_leaderboard_row= NONE_OF_HER_OWN"
check "an unrelated customer can read others' display names" "$LOG_DIR/95.log" "CONFIRM: alex_name_visible_to_casey= Iron Fist"
check "an unrelated customer can read a multi-branch challenge's branch list" "$LOG_DIR/95.log" "CONFIRM: branches_visible_to_casey= VISIBLE"
check "an unrelated customer CANNOT see a non-approved result directly" "$LOG_DIR/95.log" "CONFIRM: rejected_result_from_casey= HIDDEN"
check "staff CAN still see that same non-approved result" "$LOG_DIR/95.log" "CONFIRM: rejected_result_to_staff= VISIBLE"
check "challenge_leaderboard view returns ranked rows to a low-privilege customer" "$LOG_DIR/95.log" "CONFIRM: leaderboard_visible_to_casey= VISIBLE"
check "challenge_season_leaderboard_overall view returns ranked rows to a low-privilege customer" "$LOG_DIR/95.log" "CONFIRM: overall_leaderboard_visible_to_casey= VISIBLE"
check "challenge_season_leaderboard_by_branch view returns ranked rows to a low-privilege customer" "$LOG_DIR/95.log" "CONFIRM: branch_leaderboard_visible_to_casey= VISIBLE"
check "REGRESSION (Finding 1): GLOBAL pending result visible to its own participant" "$LOG_DIR/95.log" "CONFIRM: global_pending_to_owner= VISIBLE"
check "REGRESSION (Finding 1): GLOBAL pending result HIDDEN from an unrelated customer" "$LOG_DIR/95.log" "CONFIRM: global_pending_to_customer= HIDDEN"
check "REGRESSION (Finding 1): GLOBAL pending result still visible to staff" "$LOG_DIR/95.log" "CONFIRM: global_pending_to_staff= VISIBLE"
check "REGRESSION (Finding 1): GLOBAL pending result HIDDEN from anon" "$LOG_DIR/95.log" "CONFIRM: global_pending_to_anon= HIDDEN"
check "REGRESSION (Finding 1): GLOBAL review note visible to its own participant" "$LOG_DIR/95.log" "CONFIRM: global_review_to_owner= VISIBLE"
check "REGRESSION (Finding 1): GLOBAL review note HIDDEN from an unrelated customer" "$LOG_DIR/95.log" "CONFIRM: global_review_to_customer= HIDDEN"
check "REGRESSION (Finding 1): GLOBAL review note still visible to staff" "$LOG_DIR/95.log" "CONFIRM: global_review_to_staff= VISIBLE"
check "REGRESSION (Finding 1): GLOBAL review note HIDDEN from anon" "$LOG_DIR/95.log" "CONFIRM: global_review_to_anon= HIDDEN"
check "anon sees zero rows everywhere (not a permission error) once the jwt claim is genuinely cleared" "$LOG_DIR/95.log" "CONFIRM: anon sees participants= 0 leaderboard= 0 display_names= 0"
if grep -qiE "permission denied" "$LOG_DIR/95.log"; then
  echo "  FAIL: unexpected 'permission denied' in 95_leaderboards_and_rls.sql — the harness-fidelity default-privileges fix (00_schema.sql) may not be in effect. See $LOG_DIR/95.log"
  FAIL=$((FAIL+1))
else
  echo "  PASS: no unexpected permission-denied errors in 95_leaderboards_and_rls.sql"
  PASS=$((PASS+1))
fi

echo
echo "=== 96_null_open_guards.sql (authorization guards must fail CLOSED when auth_role() is NULL) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/96_null_open_guards.sql" "$LOG_DIR/96.log"
check "deactivated branch_manager cannot approve a GLOBAL-scope result" "$LOG_DIR/96.log" "Not authorized to review this result."
check "that GLOBAL result is still pending afterwards" "$LOG_DIR/96.log" "CONFIRM: global result status after deactivated approval attempt= pending"
check "deactivated super_admin cannot create a season" "$LOG_DIR/96.log" "Only a super admin can create a competition season."
check "deactivated super_admin cannot change the weight range" "$LOG_DIR/96.log" "Only a super admin can change the competition weight range."
check "weight range unchanged by the deactivated attempt" "$LOG_DIR/96.log" "CONFIRM: max_weight still= 15"
check "deactivated branch_manager cannot create a challenge" "$LOG_DIR/96.log" "Only a branch manager or super admin can create a competition."
check "anon cannot create a season" "$LOG_DIR/96.log" "Only a super admin can create a competition season."
check "deactivated super_admin cannot designate a coach for a branchless participant" "$LOG_DIR/96.log" "Only a super admin may designate a coach for a participant with no selected branch."
check "POSITIVE: reactivated super_admin can create a season again" "$LOG_DIR/96.log" "CONFIRM: reactivated super_admin created season id="
check "POSITIVE: service_role recognised explicitly" "$LOG_DIR/96.log" "CONFIRM: is_service_role= t is_super_admin= t"
check "NULL session: helpers return false, never NULL" "$LOG_DIR/96.log" "is_service_role= f is_super_admin= f is_branch_staff= f"

echo
echo "=== 97_submit_result_active_coach.sql (submit_challenge_result requires an authenticated, ACTIVE, authorized actor) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/97_submit_result_active_coach.sql" "$LOG_DIR/97.log"
check "(fixture) three participants registered on the fresh challenge" "$LOG_DIR/97.log" "CONFIRM: (fixture) approved participants= 3"
check "(1) POSITIVE: active, correctly assigned coach CAN submit" "$LOG_DIR/97.log" "CONFIRM: (1) active coach submitted, status= pending"
check "(2 setup) the coach designation survives deactivation" "$LOG_DIR/97.log" "CONFIRM: (2 setup) Drew's designation survives deactivation, designated_coach_id= 00000000-0000-0000-0000-000000000003"
check "(2 setup) the coach really is deactivated" "$LOG_DIR/97.log" "CONFIRM: (2 setup) Coach One is_active= f"
check "(2) DEACTIVATED coach cannot submit despite the designation" "$LOG_DIR/97.log" "Not authorized to submit a result for this participant."
check "(2) no result row was written by the deactivated coach" "$LOG_DIR/97.log" "CONFIRM: (2) results written for Drew by the deactivated coach= 0"
check "(3) NULL identity cannot submit (no fall-through past the identity gate)" "$LOG_DIR/97.log" "CONFIRM: (3) rows written by the NULL-identity caller= 0"
check "(3c) anon denied submit_challenge_result by the EXECUTE grant" "$LOG_DIR/97.log" "permission denied for function submit_challenge_result"
check "(3) nothing written by NULL/unknown/anon/service_role actors" "$LOG_DIR/97.log" "CONFIRM: (3) results written for Drew by NULL/unknown/anon/service_role actors= 0"
check "(3e) POSITIVE: the REACTIVATED coach can submit again" "$LOG_DIR/97.log" "CONFIRM: (3e) reactivated coach submitted, status= pending"
check "(4b setup) a cross-branch designation was forced into the table" "$LOG_DIR/97.log" "CONFIRM: (4b setup) Casey's designated coach forced cross-branch to= 00000000-0000-0000-0000-00000000000d"
check "(4b) DEFENSE IN DEPTH: cross-branch coach still cannot submit" "$LOG_DIR/97.log" "CONFIRM: (4b) results written cross-branch= 0"
check "(5) POSITIVE: a GLOBAL (branchless) participant is still submittable" "$LOG_DIR/97.log" "CONFIRM: (5) GLOBAL submission for a branchless participant status= pending"
check "(6) authorized review of the active coach's result still works" "$LOG_DIR/97.log" "CONFIRM: (6) result (1) status after authorized approval= approved"
check "(6b) the self-review ban is intact" "$LOG_DIR/97.log" "CONFIRM: (6b) own result status after self-approval attempt= pending"
check "(7) the points ledger was recomputed on approval" "$LOG_DIR/97.log" "CONFIRM: (7) ledger rows for Alex= 1 total points= 300"
check "(7b) the correction workflow still works for the active coach" "$LOG_DIR/97.log" "CONFIRM: (7b) correction requested, status= correction_pending"
check "(7c) the approved correction supersedes the original" "$LOG_DIR/97.log" "CONFIRM: (7c) correction status= approved"
check "(7c) the append-only ledger does not double-award" "$LOG_DIR/97.log" "CONFIRM: (7c) ledger total for Alex after the correction= 300"
check "no result anywhere has a NULL author" "$LOG_DIR/97.log" "CONFIRM: results anywhere with a NULL author= 0"
check "every account restored at the end of 97" "$LOG_DIR/97.log" "CONFIRM: profiles left deactivated= 0"

echo
echo "=== 98_correction_and_designation_active_coach.sql (correction requests and coach designation both require an ACTIVE coach) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/98_correction_and_designation_active_coach.sql" "$LOG_DIR/98.log"
# Finding A — correction request authorization
check "(A1) POSITIVE: active designated coach CAN request a correction" "$LOG_DIR/98.log" "CONFIRM: (A1) active coach correction status= correction_pending"
check "(A2 setup) the designation survives the coach's deactivation" "$LOG_DIR/98.log" "CONFIRM: (A2 setup) Coach Two is_active= f (expect f) designation still= 00000000-0000-0000-0000-000000000004"
check "(A2) DEACTIVATED coach cannot request a correction" "$LOG_DIR/98.log" "Not authorized to request a correction for this participant."
check "(A2) no correction row written by the deactivated coach" "$LOG_DIR/98.log" "CONFIRM: (A2) correction rows created by the DEACTIVATED coach= 0"
check "(A3) NULL identity rejected by AUTHORIZATION, not a NOT NULL constraint" "$LOG_DIR/98.log" "CONFIRM: (A3) correction rows created by a NULL-identity caller= 0"
check "(A3) the rejection carries the AUTHORIZATION message" "$LOG_DIR/98.log" "ERROR:  Only this participant's designated coach may request a correction for them."
# Negative check: pre-fix, the NULL-identity caller fell past the identity
# gate and was stopped by entered_by_profile_id being NOT NULL. A row count
# cannot tell the two apart (both end with zero rows), so the distinguishing
# evidence is the ABSENCE of a constraint violation anywhere in this file.
if grep -q "violates not-null constraint" "$LOG_DIR/98.log"; then
  echo "  FAIL: (A3) rejected by the NOT NULL constraint rather than by authorization"
  echo "        found 'violates not-null constraint' in: $LOG_DIR/98.log"
  FAIL=$((FAIL + 1))
  FAILED_CHECKS+=("(A3) rejected by authorization, not the NOT NULL constraint")
else
  echo "  PASS: (A3) rejected by authorization, not the NOT NULL constraint"
  PASS=$((PASS + 1))
fi
check "(A4 setup) the A4 target is genuinely uncontended" "$LOG_DIR/98.log" "existing corrections against it= 0"
check "(A4) a member-role designee cannot request a correction" "$LOG_DIR/98.log" "CONFIRM: (A4) correction rows created by a member-role designee= 0"
check "(A5 setup) an independent, uncontended A5 target was approved" "$LOG_DIR/98.log" "CONFIRM: (A5 setup) independent target status= approved"
check "(A5) CROSS-BRANCH active coach cannot request a correction" "$LOG_DIR/98.log" "CONFIRM: (A5) correction rows created cross-branch= 0"
check "(A5b) POSITIVE: the REACTIVATED coach can request it again" "$LOG_DIR/98.log" "CONFIRM: (A5b) reactivated coach correction status= correction_pending"
check "(A5c setup) the GLOBAL result was approved for the scope guard" "$LOG_DIR/98.log" "CONFIRM: (A5c setup) GLOBAL result approved= approved"
check "(A5c) POSITIVE: a GLOBAL (branchless) correction still works" "$LOG_DIR/98.log" "CONFIRM: (A5c) GLOBAL correction by an in-scope coach status= correction_pending"
check "(A6a) the self-review ban on corrections is intact" "$LOG_DIR/98.log" "CONFIRM: (A6a) own correction status after self-approval attempt= correction_pending"
check "(A6b) a DEACTIVATED reviewer cannot approve a correction" "$LOG_DIR/98.log" "CONFIRM: (A6b) correction status after deactivated approval attempt= correction_pending"
check "(A6c) an AUTHORIZED active reviewer CAN approve the correction" "$LOG_DIR/98.log" "CONFIRM: (A6c) correction status= approved"
check "(A6c) the ledger does not double-award after the correction" "$LOG_DIR/98.log" "CONFIRM: (A6c) Alex ledger total on the guard challenge= 300"
# Finding B — coach designation
check "(B7) POSITIVE: an active, in-branch coach CAN be designated" "$LOG_DIR/98.log" "CONFIRM: (B7) Casey's designated coach= 00000000-0000-0000-0000-000000000004"
check "(B8) a DEACTIVATED coach cannot be designated" "$LOG_DIR/98.log" "The designated coach must be an active profile."
check "(B8) the prior designation is left intact by the rejected attempt" "$LOG_DIR/98.log" "CONFIRM: (B8) Casey's designated coach after the deactivated attempt= 00000000-0000-0000-0000-000000000004"
check "(B12) existing designations to a deactivated coach are preserved" "$LOG_DIR/98.log" "CONFIRM: (B12) existing designations to the deactivated Coach One preserved: alex= 00000000-0000-0000-0000-000000000003 drew= 00000000-0000-0000-0000-000000000003"
check "(B12) no designation was silently nulled" "$LOG_DIR/98.log" "CONFIRM: (B12) participants left with a NULL designation= 3"
check "(B9) a non-coach role cannot be designated" "$LOG_DIR/98.log" "The designated coach must be a profile with the coach role."
check "(B9) the designation is unchanged after the member-role attempt" "$LOG_DIR/98.log" "CONFIRM: (B9) Casey's designated coach after the member-role attempt= 00000000-0000-0000-0000-000000000004"
check "(B9b) a non-existent profile cannot be designated" "$LOG_DIR/98.log" "CONFIRM: (B9b) Casey's designated coach after the ghost attempt= 00000000-0000-0000-0000-000000000004"
check "(B11) cross-branch designation remains rejected" "$LOG_DIR/98.log" "The designated coach must belong to the same branch as the participant."
check "(B11) the designation is unchanged after the cross-branch attempt" "$LOG_DIR/98.log" "CONFIRM: (B11) Casey's designated coach after the cross-branch attempt= 00000000-0000-0000-0000-000000000004"
check "(B10) acting-caller rules unchanged: Casey's coach survived every rejected caller" "$LOG_DIR/98.log" "CONFIRM: (B10) Casey's coach unchanged by every rejected caller= 00000000-0000-0000-0000-000000000004"
check "(B10d) super_admin CAN still designate for a branchless participant" "$LOG_DIR/98.log" "CONFIRM: (B10d) branchless participant's coach after manager-then-superadmin= 00000000-0000-0000-0000-000000000004"
check "every account restored at the end of 98" "$LOG_DIR/98.log" "CONFIRM: profiles left deactivated= 0"

echo
echo "=== 99_global_review_authorization.sql (H-2: GLOBAL review restricted to branch_manager / super_admin) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/99_global_review_authorization.sql" "$LOG_DIR/99.log"
# GLOBAL scope — coaches denied
check "(1-3) GLOBAL: no coach path can approve or reject a result" "$LOG_DIR/99.log" "CONFIRM: (1-3) GLOBAL result status after four coach attempts= pending"
check "(1-3) GLOBAL: the refusal is the authorization refusal" "$LOG_DIR/99.log" "Not authorized to review this result."
check "(4 setup) a GLOBAL correction exists to test against" "$LOG_DIR/99.log" "CONFIRM: (4 setup) GLOBAL correction="
check "(4) GLOBAL: no coach path can approve or reject a correction" "$LOG_DIR/99.log" "CONFIRM: (4) GLOBAL correction status after three coach attempts= correction_pending"
check "(4) GLOBAL: the correction refusal is the authorization refusal" "$LOG_DIR/99.log" "Not authorized to review this correction."
check "(4a) the self-review ban still fires BEFORE the role check" "$LOG_DIR/99.log" "You cannot approve your own correction request."
check "(5) GLOBAL: anon is denied by the EXECUTE grant" "$LOG_DIR/99.log" "permission denied for function approve_challenge_result"
check "(9) GLOBAL: the self-review prohibition on a result is intact" "$LOG_DIR/99.log" "You cannot approve your own submitted result."
check "(10) GLOBAL: result status unchanged after every denial" "$LOG_DIR/99.log" "CONFIRM: (10) GLOBAL result status after every denial= pending"
check "(10) GLOBAL: NO review row was written by any denied attempt" "$LOG_DIR/99.log" "CONFIRM: (10) review rows after all denials= UNCHANGED"
# GLOBAL scope — permitted roles still work
check "(5b) GLOBAL: an active BRANCH MANAGER can approve a result" "$LOG_DIR/99.log" "CONFIRM: (5b) GLOBAL result status after the branch manager approved= approved"
check "(6) GLOBAL: an active SUPER ADMIN can reject a correction" "$LOG_DIR/99.log" "CONFIRM: (6) GLOBAL correction status after the super admin rejected= rejected"
check "(6b) GLOBAL: an active BRANCH MANAGER can approve a correction" "$LOG_DIR/99.log" "CONFIRM: (6b) GLOBAL correction status after the branch manager approved= approved"
# BRANCH / MULTI_BRANCH regression
check "(12) BRANCH: wrong-branch restrictions remain effective" "$LOG_DIR/99.log" "CONFIRM: (12) BRANCH result status after two wrong-branch attempts= pending"
check "(11) BRANCH: an IN-BRANCH COACH can STILL approve a result" "$LOG_DIR/99.log" "CONFIRM: (11) BRANCH result status after the IN-BRANCH COACH approved= approved"
check "(11b) BRANCH: an IN-BRANCH COACH can STILL review a correction" "$LOG_DIR/99.log" "CONFIRM: (11b) BRANCH correction status after denial-then-in-branch-coach= approved"
check "(13a-b) MULTI_BRANCH: wrong-branch restrictions remain effective" "$LOG_DIR/99.log" "CONFIRM: (13a-b) MULTI result status after two wrong-branch attempts= pending"
check "(13c) MULTI_BRANCH: the in-branch manager can still review" "$LOG_DIR/99.log" "CONFIRM: (13c) MULTI result status after the IN-BRANCH manager approved= approved"
check "(fixture) Alex registered for GLOBAL through the real RPC" "$LOG_DIR/99.log" "CONFIRM: (fixture) Alex registered for GLOBAL"
check "every account restored at the end of 99" "$LOG_DIR/99.log" "CONFIRM: profiles left deactivated= 0"

echo
echo "=== 100_display_name_conflict_report.sql (READ-ONLY pre-flight: existing-data conflicts) ==="
: > "$LOG_DIR/100.log"
if [ -n "$PSQL_SUPERUSER" ]; then
  eval "$PSQL_SUPERUSER \"psql -d $SCRATCH_DB -f $HARNESS_DIR/100_display_name_conflict_report.sql\"" > "$LOG_DIR/100.log" 2>&1
else
  psql -d "$SCRATCH_DB" -f "$HARNESS_DIR/100_display_name_conflict_report.sql" > "$LOG_DIR/100.log" 2>&1
fi
check "(pre-flight) no normalized duplicate display names exist" "$LOG_DIR/100.log" "REPORT: duplicate groups= 0"
check "(pre-flight) no customer name collides with a staff identity" "$LOG_DIR/100.log" "REPORT: reserved-name collisions= 0"
check "(pre-flight) verdict is SAFE_TO_APPLY" "$LOG_DIR/100.log" "REPORT: verdict= SAFE_TO_APPLY"

echo
echo "=== 101_display_name_uniqueness.sql (M-1: normalized uniqueness + reserved staff names) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/101_display_name_uniqueness.sql" "$LOG_DIR/101.log"
check "(index) the normalized unique index exists" "$LOG_DIR/101.log" "lower(btrim(display_name))"
check "(1) the first customer can claim an available name" "$LOG_DIR/101.log" "CONFIRM: (1) Eve's display name= Thunder Kick"
check "(2) a second customer cannot claim the same name" "$LOG_DIR/101.log" "CONFIRM: (2) rows for Finn after the exact-duplicate attempt= 0"
check "(3) case-differing duplicates are rejected" "$LOG_DIR/101.log" "CONFIRM: (3) rows for Finn after three case variants= 0"
check "(4) whitespace-differing duplicates are rejected" "$LOG_DIR/101.log" "CONFIRM: (4) rows for Finn after three whitespace variants= 0"
check "(5-9) all nine staff-name attempts were refused" "$LOG_DIR/101.log" "CONFIRM: (5-9) rows for Finn after nine staff-name attempts= 0"
check "(5-9) no customer name impersonates a staff identity" "$LOG_DIR/101.log" "CONFIRM: (5-9) customer names impersonating staff= 0"
check "(10) a NULL identity is denied by AUTHORIZATION" "$LOG_DIR/101.log" "Not authorized to set a display name."
check "(10) the NULL-identity caller wrote nothing" "$LOG_DIR/101.log" "CONFIRM: (10) rows written by the NULL-identity caller= 0"
check "(11) a customer can re-save their own name" "$LOG_DIR/101.log" "CONFIRM: (11) after re-saving the same name= Thunder Kick"
check "(11) a customer can re-case their own name" "$LOG_DIR/101.log" "CONFIRM: (11) after re-casing their OWN name= THUNDER KICK"
check "(12) a customer can change to an available name" "$LOG_DIR/101.log" "CONFIRM: (12) Finn's display name= Iron Hook"
check "(12b) POSITIVE: a staff member may use their OWN real name" "$LOG_DIR/101.log" "CONFIRM: (12b) Coach One's own-name claim= Coach One (Branch B)"
check "(13) the pre-existing display names are untouched" "$LOG_DIR/101.log" "CONFIRM: (13) originals intact= Iron Fist / Blair the Racer / Casey No Branch / Drew the Challenger"
check "(13) no normalized duplicates exist anywhere" "$LOG_DIR/101.log" "CONFIRM: (13) normalized duplicates anywhere in the table= NO_DUPLICATES"
check "(14) every leaderboard row carries a usable display name" "$LOG_DIR/101.log" "CONFIRM: (14) every leaderboard row carries a usable display name= ALL_ROWS_NAMED"
check "(16) all three leaderboard views are functional" "$LOG_DIR/101.log" "CONFIRM: (16) all three views functional= ALL_THREE_FUNCTIONAL"
check "(15) the views expose no private profile fields" "$LOG_DIR/101.log" "CONFIRM: (15) private columns exposed by the three views= 0"
check "(15b) no staff profile appears on the leaderboard" "$LOG_DIR/101.log" "CONFIRM: (15b) staff rows on the challenge leaderboard= 0"
# Privacy: the refusal must be identical for taken-name and reserved-name, so
# the caller cannot tell which it was, and must not echo the staff name back.
check "(privacy) the refusal is the single generic message" "$LOG_DIR/101.log" "This display name is unavailable. Please choose another name."
if grep -qE "unavailable.*(Sam Super|Mona Manager|Coach One|Carl Manager|Coach Three)" "$LOG_DIR/101.log"; then
  echo "  FAIL: (privacy) a refusal echoed a staff name back to the caller"
  FAIL=$((FAIL + 1)); FAILED_CHECKS+=("(privacy) refusal leaked a staff name")
else
  echo "  PASS: (privacy) no refusal echoed a staff name back to the caller"
  PASS=$((PASS + 1))
fi

echo
echo "=== 102 concurrency: three rounds of simultaneous duplicate claims ==="
ROUND_NAMES_A=("Race Lightning" "Race Thunder" "Race Cyclone")
ROUND_NAMES_B=("Race Lightning" "race thunder" "   Race Cyclone   ")
ROUND_LABEL=("identical" "case-differing" "whitespace-differing")
ROUND_SUB_A=("00000000-0000-0000-0000-0000000000b1" "00000000-0000-0000-0000-0000000000b3" "00000000-0000-0000-0000-0000000000b5")
ROUND_SUB_B=("00000000-0000-0000-0000-0000000000b2" "00000000-0000-0000-0000-0000000000b4" "00000000-0000-0000-0000-0000000000b6")
for i in 0 1 2; do
  sed -e "s/__NAME_A__/${ROUND_NAMES_A[$i]}/" -e "s/__SUB_A__/${ROUND_SUB_A[$i]}/" \
    "$HARNESS_DIR/102_race_name_a.sql.template" > "$LOG_DIR/102_a_$i.sql"
  sed -e "s/__NAME_B__/${ROUND_NAMES_B[$i]}/" -e "s/__SUB_B__/${ROUND_SUB_B[$i]}/" \
    "$HARNESS_DIR/102_race_name_b.sql.template" > "$LOG_DIR/102_b_$i.sql"

  if [ -n "$PSQL_SUPERUSER" ]; then
    eval "$PSQL_SUPERUSER \"psql -d $SCRATCH_DB -f $LOG_DIR/102_a_$i.sql\"" > "$LOG_DIR/102_a_$i.log" 2>&1 &
  else
    psql -d "$SCRATCH_DB" -f "$LOG_DIR/102_a_$i.sql" > "$LOG_DIR/102_a_$i.log" 2>&1 &
  fi
  A_PID=$!
  sleep 0.5
  if [ -n "$PSQL_SUPERUSER" ]; then
    eval "$PSQL_SUPERUSER \"psql -d $SCRATCH_DB -f $LOG_DIR/102_b_$i.sql\"" > "$LOG_DIR/102_b_$i.log" 2>&1 &
  else
    psql -d "$SCRATCH_DB" -f "$LOG_DIR/102_b_$i.sql" > "$LOG_DIR/102_b_$i.log" 2>&1 &
  fi
  B_PID=$!
  wait "$A_PID"; wait "$B_PID"

  check "(17/${ROUND_LABEL[$i]}) session A's claim committed" "$LOG_DIR/102_a_$i.log" "COMMIT"
  check "(17/${ROUND_LABEL[$i]}) session B got the GENERIC validation error, not a raw unique violation" "$LOG_DIR/102_b_$i.log" "This display name is unavailable. Please choose another name."
  if grep -qiE "duplicate key value|unique constraint|uq_challenge_display_names_normalized" "$LOG_DIR/102_b_$i.log"; then
    echo "  FAIL: (17/${ROUND_LABEL[$i]}) a raw unique-violation reached the client"
    FAIL=$((FAIL + 1)); FAILED_CHECKS+=("(17/${ROUND_LABEL[$i]}) raw unique violation leaked")
  else
    echo "  PASS: (17/${ROUND_LABEL[$i]}) no raw unique-violation text reached the client"
    PASS=$((PASS + 1))
  fi

  # Written to a file and run with -f: nesting this query inside eval + -c
  # mangles the quoting, and the resulting syntax error still contains the
  # digit "1" (in "LINE 1"), which a substring check would accept as a pass.
  printf "%s\n" \
    "select 'CLAIMANTS=' || count(*) as verdict from challenge_display_names" \
    "where lower(btrim(display_name)) = lower(btrim('${ROUND_NAMES_A[$i]}'));" \
    > "$LOG_DIR/102_count_$i.sql"
  if [ -n "$PSQL_SUPERUSER" ]; then
    eval "$PSQL_SUPERUSER \"psql -tA -d $SCRATCH_DB -f $LOG_DIR/102_count_$i.sql\"" > "$LOG_DIR/102_count_$i.log" 2>&1
  else
    psql -tA -d "$SCRATCH_DB" -f "$LOG_DIR/102_count_$i.sql" > "$LOG_DIR/102_count_$i.log" 2>&1
  fi
  check "(17/${ROUND_LABEL[$i]}) exactly ONE claimant holds the name" "$LOG_DIR/102_count_$i.log" "CLAIMANTS=1"
done

echo
echo "=== 103_identity_hardening.sql (L-1: participation identity; L-2: pinned search_path) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/103_identity_hardening.sql" "$LOG_DIR/103.log"
check "(fixture) a registration-open competition exists to test against" "$LOG_DIR/103.log" "CONFIRM: (fixture) registration-open competition= OPEN"
# L-2
check "(L2-1) is_admin and is_super_admin both carry a pinned search_path" "$LOG_DIR/103.log" "CONFIRM: (L2-1) helper search_path= BOTH_PINNED"
check "(L2-2) is_super_admin truth table unchanged across all five identities" "$LOG_DIR/103.log" "CONFIRM: (L2-2) is_super_admin super/bm/coach/member/null= true / false / false / false / false"
check "(L2-2) is_admin truth table unchanged across all five identities" "$LOG_DIR/103.log" "CONFIRM: (L2-2) is_admin       super/bm/coach/member/null= true / true / false / false / false"
check "(L2-3) a deactivated super admin is neither super admin nor admin" "$LOG_DIR/103.log" "CONFIRM: (L2-3) deactivated super admin is_super_admin/is_admin= false / false"
# L-1 (a) NULL identity
check "(L1-1) a NULL identity is refused BY AUTHORIZATION" "$LOG_DIR/103.log" "Not authorized to request participation in a competition."
check "(L1-1) the NULL-identity refusal is NOT the display-name message" "$LOG_DIR/103.log" "CONFIRM: (L1-1) NULL-identity caller wrote= NO_ROW_WRITTEN"
# L-1 (b) staff cannot compete
check "(L1-2..4) every staff role is refused with the member-only message" "$LOG_DIR/103.log" "Only a member account can enter a competition."
check "(L1-2..4) no staff participant row exists anywhere in the schema" "$LOG_DIR/103.log" "CONFIRM: (L1-2..4) staff participant rows anywhere in the schema= NO_STAFF_PARTICIPANT"
# L-1 (c) deactivated member
check "(L1-5 setup) the deactivated member already held a display name" "$LOG_DIR/103.log" "CONFIRM: (L1-5 setup) Eve has a display name= HAS_NAME"
# L-1 (d) positive controls
check "(L1-6) POSITIVE: an active member still joins, approved" "$LOG_DIR/103.log" "CONFIRM: (L1-6) active member joined with status/eligible= approved / true"
check "(L1-7 setup) the nameless-member fixture really has no name" "$LOG_DIR/103.log" "CONFIRM: (L1-7 setup) Race Four has NO display name= NO_NAME"
check "(L1-7) POSITIVE: the display-name requirement still fires" "$LOG_DIR/103.log" "Set a display name before requesting to join a competition."
check "(L1-8) POSITIVE: the duplicate-request guard still fires" "$LOG_DIR/103.log" "A participation request already exists for this competition."
check "(L1-9) POSITIVE: the branch-scope rule still fires" "$LOG_DIR/103.log" "This competition is only open to its own branch."
check "(L1-10) POSITIVE: an unknown competition is still reported as not found" "$LOG_DIR/103.log" "Challenge not found:"
check "(L1-10) POSITIVE: the lifecycle rule still fires" "$LOG_DIR/103.log" "This competition is not currently open for registration."
# state
check "(final) exactly one participant row was added by this file" "$LOG_DIR/103.log" "CONFIRM: (final) participant rows added by this file= EXACTLY_ONE_ADDED"
check "(final) the only row on the fixture competition belongs to a member" "$LOG_DIR/103.log" "CONFIRM: (final) rows on the fixture competition= ONLY_EVE_A_MEMBER"
check "every account restored at the end of 103" "$LOG_DIR/103.log" "CONFIRM: profiles left deactivated= 0"

echo
echo "=== 104_force_rls_assessment.sql (L-3: FORCE ROW LEVEL SECURITY) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/104_force_rls_assessment.sql" "$LOG_DIR/104.log"
check "(1) every challenges table has a single owner" "$LOG_DIR/104.log" "CONFIRM: (1) challenges tables owner= ONE_OWNER:"
check "(1) every SECURITY DEFINER challenges function has that same single owner" "$LOG_DIR/104.log" "CONFIRM: (1) SECURITY DEFINER challenges functions owner= ONE_OWNER:"
check "(2) FORCE binds ONLY an owner without superuser/BYPASSRLS" "$LOG_DIR/104.log" "CONFIRM: (2) verdict= FORCE_BINDS_PLAIN_OWNER_ONLY"
check "(3) FORCE is on for all ten challenges tables during the probe" "$LOG_DIR/104.log" "CONFIRM: (3) tables with FORCE on= 10"
check "(3c) a member can still join with FORCE on" "$LOG_DIR/104.log" "CONFIRM: (3c) member joined under FORCE with status= approved"
check "(3d) a coach designation still works with FORCE on" "$LOG_DIR/104.log" "CONFIRM: (3d) coach designation under FORCE= DESIGNATED"
check "(3f) an approval still works with FORCE on" "$LOG_DIR/104.log" "CONFIRM: (3f) approval under FORCE left status= approved"
check "(3f) the points ledger is still written with FORCE on" "$LOG_DIR/104.log" "CONFIRM: (3f) points ledger under FORCE= LEDGER_WRITTEN"
check "(3g) a display name can still be saved with FORCE on" "$LOG_DIR/104.log" "CONFIRM: (3g) display name under FORCE= NAME_SAVED"
check "(4/5) a client's reads are identical with FORCE on and off" "$LOG_DIR/104.log" "CONFIRM: (5) verdict= CLIENT_READS_IDENTICAL"
check "(5) every FORCE flag is restored at the end" "$LOG_DIR/104.log" "CONFIRM: (5) FORCE flags after restore= ALL_RESTORED"
check "(6) neither anon nor authenticated can act as the tables owner" "$LOG_DIR/104.log" "CONFIRM: (6) owner isolation= NO_CLIENT_OWNS_OR_INHERITS"

echo
echo "=== 105_rls_write_paths.sql (L-4: RLS write paths under production-faithful grants) ==="
run_psql "$SCRATCH_DB" "$HARNESS_DIR/105_rls_write_paths.sql" "$LOG_DIR/105.log"
# (1) the harness is production-faithful
check "(1) the client privilege matrix is exactly as intended (incl. the two deliberate revokes)" "$LOG_DIR/105.log" "CONFIRM: (1) client table privileges= PRIVILEGE_MATRIX_AS_EXPECTED"
check "(1) authenticated holds INSERT on every challenges table" "$LOG_DIR/105.log" "CONFIRM: (1) authenticated holds INSERT on every challenges table= INSERT_GRANTED_EVERYWHERE"
check "(1b) there is no write policy anywhere on the challenges tables" "$LOG_DIR/105.log" "CONFIRM: (1b) write policies on challenges tables= NO_WRITE_POLICIES"
# (2) INSERT refused BY RLS, not by a missing grant
check "(2) a direct INSERT is refused by ROW-LEVEL SECURITY" "$LOG_DIR/105.log" "new row violates row-level security policy"
check "(2) and NOT by a missing table grant" "$LOG_DIR/105.log" "CONFIRM: (1) authenticated holds INSERT on every challenges table= INSERT_GRANTED_EVERYWHERE"
check "(2) no forged points-ledger row exists" "$LOG_DIR/105.log" "CONFIRM: (2) forged ledger rows= NO_LEDGER_FORGERY"
check "(2) no forged result row exists" "$LOG_DIR/105.log" "CONFIRM: (2) forged result rows= NO_FORGED_RESULT"
check "(2) a member created no competition" "$LOG_DIR/105.log" "CONFIRM: (2) competitions created by a member= NO_MEMBER_CHALLENGE"
# (3) UPDATE affects zero rows, and the values are unchanged
check "(3) every denied UPDATE affected ZERO rows" "$LOG_DIR/105.log" "UPDATE 0"
check "(3b) a member cannot inflate their own result value" "$LOG_DIR/105.log" "CONFIRM: (3b) own result value after a direct UPDATE= VALUE_UNCHANGED"
check "(3c) a member cannot sabotage a rival's result" "$LOG_DIR/105.log" "CONFIRM: (3c) rival result after a direct UPDATE= RIVAL_UNCHANGED"
check "(3d) a member cannot take over another member's display name" "$LOG_DIR/105.log" "CONFIRM: (3d) another member's display name after a direct UPDATE= NAME_UNCHANGED"
check "(3e) a member cannot edit even their OWN display-name row directly" "$LOG_DIR/105.log" "CONFIRM: (3e) own display name after a direct UPDATE= OWN_NAME_UNCHANGED"
check "(3f) no coach can self-designate by direct UPDATE" "$LOG_DIR/105.log" "CONFIRM: (3f) designated coach after two direct UPDATEs= DESIG_UNCHANGED"
check "(3g) a branch manager cannot move a competition's lifecycle directly" "$LOG_DIR/105.log" "CONFIRM: (3g) competition status after a direct UPDATE= STATUS_UNCHANGED"
check "(3h) a super admin cannot change the weight range directly" "$LOG_DIR/105.log" "CONFIRM: (3h) weight-range setting after a direct UPDATE= SETTING_UNCHANGED"
# (4) DELETE
check "(4) every denied DELETE affected ZERO rows" "$LOG_DIR/105.log" "DELETE 0"
check "(4) every targeted row is still present" "$LOG_DIR/105.log" "CONFIRM: (4) every targeted row still present= NOTHING_DELETED"
# (5) negative controls — each assertion is shown to FLIP
check "(5/N1) an INSERT policy makes the self-award succeed" "$LOG_DIR/105.log" "CONFIRM: (5/N1) with an INSERT policy the self-award succeeds= N1_FLIPPED"
check "(5/N2) an UPDATE policy makes the self-inflation succeed" "$LOG_DIR/105.log" "CONFIRM: (5/N2) with an UPDATE policy the self-inflation succeeds= N2_FLIPPED"
check "(5/N3) a DELETE policy destroys the rival's result" "$LOG_DIR/105.log" "CONFIRM: (5/N3) with a DELETE policy the rival's result is destroyed= N3_FLIPPED"
check "(5/N4) removing the ownership gate exposes other people's rows" "$LOG_DIR/105.log" "CONFIRM: (5/N4) with the ownership gate removed other people's rows are visible= N4_FLIPPED"
check "(5/N5) weakening the status gate exposes other people's pending results" "$LOG_DIR/105.log" "CONFIRM: (5/N5) with the status gate weakened other people's pending results are visible= N5_FLIPPED"
# (6) restoration
check "(6) the policy count is restored after rollback" "$LOG_DIR/105.log" "CONFIRM: (6) policy count= POLICY_COUNT_RESTORED"
check "(6) no negative-control policy is left behind" "$LOG_DIR/105.log" "CONFIRM: (6) leftover negative-control policies= NO_NEGATIVE_CONTROL_POLICIES_LEFT"
check "(6) both dropped policies are back" "$LOG_DIR/105.log" "CONFIRM: (6) the two dropped policies= BOTH_ORIGINALS_BACK"
check "(6) there is no write policy after rollback" "$LOG_DIR/105.log" "CONFIRM: (6) write policies after rollback= NO_WRITE_POLICIES"
check "(6) no negative-control ledger row survived" "$LOG_DIR/105.log" "CONFIRM: (6) negative-control ledger rows= NO_NEGATIVE_CONTROL_ROWS"
check "(6) the mutated result value is restored" "$LOG_DIR/105.log" "CONFIRM: (6) the result the controls mutated= VALUE_RESTORED"
check "(6) the deleted rival result is restored" "$LOG_DIR/105.log" "CONFIRM: (6) the result the controls deleted= RIVAL_RESULT_RESTORED"
check "(6) the ownership gate is effective again" "$LOG_DIR/105.log" "CONFIRM: (6) ownership gate after rollback= HIDDEN_AGAIN"
check "(6) the status gate is effective again" "$LOG_DIR/105.log" "CONFIRM: (6) status gate after rollback= HIDDEN_AGAIN"
# (7) positive controls
check "(7) the legitimate RPC write path still works" "$LOG_DIR/105.log" "CONFIRM: (7) a member renaming themselves through the RPC= RPC_WRITE_OK"
check "(7) a member can still read their own participation" "$LOG_DIR/105.log" "CONFIRM: (7) a member can still read their own participation= OWN_ROW_READABLE"

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
