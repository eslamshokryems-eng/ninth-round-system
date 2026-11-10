#!/usr/bin/env bash
# LOCAL DEV ONLY. Rebuilds the local database from the real migrations, seeds
# the demo cast, runs the ten-step end-to-end acceptance test, and checks
# every CONFIRM marker it prints. Leaves the database in the state the
# browser demo needs.
#
# Never connects to Supabase or any remote database.
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"
HERE="$(pwd)"
DB="${LOCAL_DB:-ninth_round_local}"
LOG_DIR="$HERE/.apply-logs"
LOG="$LOG_DIR/acceptance.log"
PASS=0; FAIL=0; FAILED=()

if [ -z "${PSQL_SUPERUSER+x}" ]; then
  if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
    PSQL_SUPERUSER="su postgres -c"
  else
    PSQL_SUPERUSER=""
  fi
fi

check() {
  local label="$1" expected="$2"
  if grep -qF "$expected" "$LOG"; then
    echo "  PASS: $label"; PASS=$((PASS+1))
  else
    echo "  FAIL: $label"
    echo "        expected: $expected"
    FAIL=$((FAIL+1)); FAILED+=("$label")
  fi
}

if [ "${SKIP_REBUILD:-0}" != "1" ]; then
  bash "$HERE/apply.sh" > "$LOG_DIR/acceptance_apply.log" 2>&1 || {
    echo "Rebuild failed — see $LOG_DIR/acceptance_apply.log"; tail -20 "$LOG_DIR/acceptance_apply.log"; exit 1; }
  echo "=== Database rebuilt from the real migrations + demo seed ==="
fi

mkdir -p "$LOG_DIR"
if [ -n "$PSQL_SUPERUSER" ]; then
  eval "$PSQL_SUPERUSER \"psql -d $DB -f $HERE/20_acceptance_test.sql\"" > "$LOG" 2>&1
else
  psql -d "$DB" -f "$HERE/20_acceptance_test.sql" > "$LOG" 2>&1
fi

echo "=== Ten-step end-to-end acceptance test ==="
check "STEP 1  the super admin created a season"                       "CONFIRM: STEP 1 season= SEASON_CREATED"
check "STEP 1  a member cannot create a season"                        "CONFIRM: STEP 1 member refused= MEMBER_REFUSED"
check "STEP 2  the weight range was set"                               "CONFIRM: STEP 2 weight range= RANGE_1_20"
check "STEP 2  a competition outside the range is refused"             "CONFIRM: STEP 2 out-of-range refused= OUT_OF_RANGE_REFUSED"
check "STEP 3  the branch manager created a BRANCH competition"        "CONFIRM: STEP 3 branch competition= CREATED_AS_DRAFT"
check "STEP 3  its two age rules were recorded"                        "CONFIRM: STEP 3 eligibility rules= TWO_AGE_RULES"
check "STEP 3  a branch manager's scope limits hold"                   "CONFIRM: STEP 3 branch-manager scope limits= SCOPE_LIMITS_HELD"
check "STEP 4  age rules were added after creation, through the RPC"  "CONFIRM: STEP 4 rules added through the RPC= TWO_RULES_ADDED_BY_RPC"
check "STEP 4  a duplicate, an inverted and an out-of-range rule are refused" "CONFIRM: STEP 4 invalid rules= BAD_RULES_REFUSED"
check "STEP 4  a branch manager, coach and member cannot change a GLOBAL competition's rules" "CONFIRM: STEP 4 unauthorized rule changes= UNAUTHORIZED_RULES_REFUSED"
check "STEP 4  the super admin created the global competitions"        "CONFIRM: STEP 4 global competitions= TWO_GLOBAL_CREATED"
check "STEP 5  all three competitions opened for registration"         "CONFIRM: STEP 5 registration opened= ALL_THREE_OPEN"
check "STEP 5  a lifecycle step cannot be skipped"                    "CONFIRM: STEP 5 skipping a lifecycle step= STEP_SKIP_REFUSED"
check "STEP 5  a coach cannot change a competition's status"           "CONFIRM: STEP 5 coach refused= COACH_REFUSED"
check "STEP 5  six branch members joined"                              "CONFIRM: STEP 5 branch participants= SIX_JOINED"
check "STEP 5  all six were eligible"                                  "CONFIRM: STEP 5 eligible in branch competition= ALL_SIX_ELIGIBLE"
check "STEP 5  all twelve members requested the global competition"    "CONFIRM: STEP 5 global participation requests= TWELVE_REQUESTED"
check "STEP 5  ten were eligible"                                      "CONFIRM: STEP 5 eligible in global competition= TEN_ELIGIBLE"
check "STEP 5  the under-age and over-age entries were refused"        "CONFIRM: STEP 5 age-ineligible entries= TWO_REJECTED_WITH_REASONS"
check "STEP 6  every approved participant has a designated coach"      "CONFIRM: STEP 6 coach designation= ALL_APPROVED_HAVE_A_COACH"
check "STEP 6  a cross-branch designation is refused"                  "CONFIRM: STEP 6 cross-branch designation= CROSS_BRANCH_REFUSED"
check "STEP 6  a deactivated coach cannot be designated"               "The designated coach must be an active profile."
check "STEP 7  both competitions went active"                          "CONFIRM: STEP 7 competitions active= BOTH_ACTIVE"
check "STEP 7  every athlete has a result"                             "CONFIRM: STEP 7 submitted results= EVERY_ATHLETE_HAS_A_RESULT"
check "STEP 7  every new result starts pending"                        "CONFIRM: STEP 7 every new result starts pending= ALL_PENDING"
check "STEP 7  a wrong coach and a self-submitting member are refused" "CONFIRM: STEP 7 unauthorized submissions= UNAUTHORIZED_SUBMISSIONS_REFUSED"
check "STEP 8  one result was rejected with a reason"                  "CONFIRM: STEP 8 rejection= ONE_REJECTED_WITH_A_REASON"
check "STEP 8  five results were approved"                             "CONFIRM: STEP 8 approvals= FIVE_APPROVED"
check "STEP 8  points were awarded to the five approved athletes"      "CONFIRM: STEP 8 points awarded= FIVE_ATHLETES_SCORED"
check "STEP 8  the rejected athlete scored nothing"                    "CONFIRM: STEP 8 the rejected athlete= REJECTED_ATHLETE_SCORED_NOTHING"
check "STEP 8  H-2: a coach cannot review in a GLOBAL competition"     "CONFIRM: STEP 8 GLOBAL review by a coach= GLOBAL_COACH_REFUSED"
check "STEP 8  but the branch manager can"                             "CONFIRM: STEP 8 GLOBAL review by the branch manager= TEN_APPROVED_GLOBALLY"
check "STEP 9  a correction was requested"                             "CONFIRM: STEP 9 correction requested= CORRECTION_PENDING"
check "STEP 9  its author cannot approve it"                           "CONFIRM: STEP 9 self-review of a correction= SELF_REVIEW_REFUSED"
check "STEP 9  the manager approved it"                                "CONFIRM: STEP 9 correction approved= CORRECTION_APPROVED"
check "STEP 9  the original result was marked superseded"              "CONFIRM: STEP 9 the original result= ORIGINAL_MARKED_SUPERSEDED"
check "STEP 9  the standings show the corrected value"                 "CONFIRM: STEP 9 the standings show= CORRECTED_VALUE_ON_BOARD"
check "STEP 9  and the superseded value is gone from the standings"    "CONFIRM: STEP 9 the old value= SUPERSEDED_VALUE_GONE"
check "STEP 10 the competition was completed"                          "CONFIRM: STEP 10 competition= COMPLETED"
check "STEP 10 a completed competition cannot be reopened"             "CONFIRM: STEP 10 reopen attempts= STILL_COMPLETED"
check "STEP 10 the leaderboard shows five ranked athletes"             "CONFIRM: STEP 10 challenge leaderboard rows= FIVE_RANKED"
check "STEP 10 no two athletes share a rank"                           "CONFIRM: STEP 10 rank uniqueness= NO_DUPLICATE_RANKS"
check "STEP 10 every leaderboard row carries a display name"           "CONFIRM: STEP 10 display names= ALL_NAMED"
check "STEP 10 the season overall leaderboard is populated"            "CONFIRM: STEP 10 season overall leaderboard= SEASON_OVERALL_POPULATED"
check "STEP 10 the season by-branch leaderboard is populated"          "CONFIRM: STEP 10 season by-branch leaderboard= SEASON_BY_BRANCH_POPULATED"
check "STEP 10 an outsider sees no raw participant rows"               "CONFIRM: STEP 10 other people's raw participant rows= NO_OTHER_PARTICIPANT_ROWS"
check "STEP 10 no staff account appears on the leaderboard"            "CONFIRM: STEP 10 staff on the leaderboard= NO_STAFF_ON_THE_BOARD"
check "STEP 11 a second ORIGINAL while one is pending is refused"        "CONFIRM: STEP 11 a second original while one is pending= ONE_PENDING_ORIGINAL"
check "STEP 11 the rejected result is kept with status rejected"          "CONFIRM: STEP 11 first result after rejection= rejected"
check "STEP 11 the coach can submit a CORRECTED result after a rejection"  "CONFIRM: STEP 11 resubmission after rejection= REJECTED_KEPT_AND_NEW_PENDING"
check "STEP 11 a manager, another coach and the athlete cannot resubmit"   "CONFIRM: STEP 11 resubmission by a manager, another coach or the athlete= NOBODY_ELSE_COULD"
check "STEP 11 the corrected result is approved and the history is kept"   "CONFIRM: STEP 11 approval of the corrected result= APPROVED_AND_HISTORY_KEPT"
check "STEP 11 points are awarded for the approved result"                 "CONFIRM: STEP 11 points for the approved result= POINTS_AWARDED"
check "STEP 11 audit: both submissions recorded, by the coach"             "CONFIRM: STEP 11 audit: submissions= TWO_SUBMISSIONS_BY_THE_COACH"
check "STEP 11 audit: rejection reason and approval recorded, by the manager" "CONFIRM: STEP 11 audit: reviews= REJECTION_REASON_AND_APPROVAL_RECORDED"
check "STEP 11 audit: both status transitions recorded"                    "CONFIRM: STEP 11 audit: status transitions= BOTH_TRANSITIONS_RECORDED"
check "STEP 11 audit: the complete history is six tagged events"           "CONFIRM: STEP 11 audit: complete history= SIX_EVENTS_ALL_TAGGED_WITH_THE_COMPETITION"
check "STEP 11 the probe left no data behind"                              "CONFIRM: STEP 11 demo data= PROBE_LEFT_NOTHING_BEHIND"
check "every account restored at the end"                              "CONFIRM: every account restored= NO_PROFILE_LEFT_DEACTIVATED"

echo
grep -E "^DEMO: |^ DEMO: " "$LOG" | sed 's/^ *//' | head -2
echo
echo "=============================================="
echo "ACCEPTANCE: $PASS passed, $FAIL failed"
echo "=============================================="
if [ "$FAIL" -gt 0 ]; then
  echo "Failed checks:"; for f in "${FAILED[@]}"; do echo "  - $f"; done
  echo "Full log: $LOG"
  exit 1
fi
exit 0
