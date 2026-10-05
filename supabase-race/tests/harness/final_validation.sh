# Sourced by run.sh (needs: PSQL array, DB, WORK, ROOT, q(), pass(), fail(), barrier_hold). FINAL END-TO-END VALIDATION.
# plan (independent model) -> setup (registration … lock) -> parallel check-in storm -> the race (driver) -> post-race (corrections, rankings, publication)
# -> export -> independent comparison.
declare -F q >/dev/null || {          # (when run on its own: ONLY_FINAL=1)
  q() { "${PSQL[@]}" -d "$DB" -At -c "$1"; }
  pass() { echo "PASS  $1"; }
  fail() { echo "FAIL  $1"; exit 1; }
  barrier_hold() { ( "${PSQL[@]}" -d "$DB" -c "select pg_advisory_lock(777); select pg_sleep($1)" >/dev/null 2>&1 & ); sleep 0.7; }
}
FV="$HERE/final"
mkdir -p "$WORK/final"
node "$ROOT/docs/race/scripts/final-model.mjs" plan > "$WORK/final/plan.json"
chmod 644 "$WORK/final/plan.json"
PLAN_BYTES=$(wc -c < "$WORK/final/plan.json")
echo "final: independent model produced the plan ($PLAN_BYTES bytes)"
"${PSQL[@]}" -d "$DB" -v planfile="$WORK/final/plan.json" -f "$FV/setup.sql" > "$WORK/final/setup.out" 2>&1 || { grep -m5 -E "ERROR|FAIL" "$WORK/final/setup.out"; fail "final: setup failed"; }
pass "final: registration (51), payment status (49 paid, 1 waived, 1 unpaid), 6 heats assigned and locked — real RPCs, real roles"

EVF=$(q "select race_test.id('ev_f')")
REC=$(q "select race_test.id('f_rec')"); MASTERID=$(q "select race_test.id('f_master')")
fv_reg() { q "select race_final.rid('fv$1')"; }
asu() { echo "select set_config('request.jwt.claim.sub','$1',false); set role authenticated; select pg_advisory_lock_shared(777); select pg_advisory_unlock_shared(777);"; }

# a desk checks in the WRONG athlete (N005 instead of N006); Master Control corrects it — the original check-in must stay in the history
q "select set_config('request.jwt.claim.sub','$REC',false); set role authenticated; select race_check_in('$(fv_reg 5)')" >/dev/null
q "select set_config('request.jwt.claim.sub','$MASTERID',false); set role authenticated; select race_correct_check_in('$(fv_reg 5)', '$(fv_reg 6)', 'desk checked in the wrong athlete')" >/dev/null

# SIMULTANEOUS CHECK-INS: everybody who is on time arrives at the same instant; six desks also double-click athlete 1 and three double-click athlete 2
rm -rf "$WORK/final/ci"; mkdir -p "$WORK/final/ci"
barrier_hold 4
for n in $(seq 1 50); do
  case "$n" in 5|6|14|48|49) continue;; esac
  ( "${PSQL[@]}" -d "$DB" -At -c "$(asu "$REC") select race_check_in('$(fv_reg "$n")')" > "$WORK/final/ci/$n.out" 2> "$WORK/final/ci/$n.err" || true ) &
done
for k in 1 2 3 4 5 6; do ( "${PSQL[@]}" -d "$DB" -At -c "$(asu "$REC") select race_check_in('$(fv_reg 1)')" > "$WORK/final/ci/d1_$k.out" 2> "$WORK/final/ci/d1_$k.err" || true ) & done
for k in 1 2 3; do ( "${PSQL[@]}" -d "$DB" -At -c "$(asu "$REC") select race_check_in('$(fv_reg 2)')" > "$WORK/final/ci/d2_$k.out" 2> "$WORK/final/ci/d2_$k.err" || true ) & done
wait; sleep 1
errs=$(cat "$WORK"/final/ci/*.err | grep -c 'ERROR' || true)
active=$(q "select count(*) from race_check_ins ci join race_registrations g on g.id = ci.registration_id where g.event_id='$EVF' and ci.voided_by_correction_id is null")
dups=$(q "select count(*) from (select registration_id from race_check_ins ci join race_registrations g on g.id = ci.registration_id where g.event_id='$EVF' and ci.voided_by_correction_id is null group by 1 having count(*) > 1) x")
[ "$errs" = "0" ] && [ "$active" = "46" ] && [ "$dups" = "0" ] || fail "final: simultaneous check-ins — errors=$errs active=$active duplicated-athletes=$dups (want 0 / 46 / 0)"
orig=$(q "select count(*) from race_check_ins ci join race_registrations g on g.id = ci.registration_id where g.id='$(fv_reg 5)'")
corr=$(q "select count(*) from race_check_in_corrections where event_id='$EVF'")
[ "$orig" = "1" ] && [ "$corr" = "1" ] || fail "final: the wrong check-in and its correction must both stay in the history (check-ins of N005=$orig, corrections=$corr)"
pass "final: 45 athletes + 9 duplicate desk presses checked in at the same instant → 46 active check-ins (incl. the corrected one), no duplicates, no errors; the wrong check-in of N005 and its correction both remain in the history"

# THE RACE ---------------------------------------------------------------------------------------------------------------------------------------------
q "select set_config('request.jwt.claim.sub','$MASTERID',false); set role authenticated; select race_start_event('$EVF')" >/dev/null
"${PSQL[@]}" -d "$DB" -v planfile="$WORK/final/plan.json" -f "$FV/run.sql" >/dev/null 2>"$WORK/final/run.err" || { cat "$WORK/final/run.err" | head -5; fail "final: driver setup failed"; }
START_TS=$(date +%s)
"${PSQL[@]}" -d "$DB" -At -c "select 'select race_final.step();' from generate_series(1, 40000)" | "${PSQL[@]}" -d "$DB" -At -q -f - > "$WORK/final/steps.out" 2> "$WORK/final/steps.err" || true
if grep -q "ERROR" "$WORK/final/steps.err"; then grep -m3 "ERROR" "$WORK/final/steps.err"; fail "final: the race driver stopped on an error"; fi
STEPS=$(q "select steps from race_final.state"); DONE=$(q "select done from race_final.state")
echo "final: the race ran in $(( $(date +%s) - START_TS )) s of wall time, $STEPS driver steps"
[ "$DONE" = "t" ] || fail "final: the race driver did not finish (steps=$STEPS)"

# POST-RACE: corrections, rankings, official publication --------------------------------------------------------------------------------------------
"${PSQL[@]}" -d "$DB" -f "$FV/post.sql" >/dev/null 2>"$WORK/final/post.err" || { grep -m3 ERROR "$WORK/final/post.err"; fail "final: post-race step failed"; }
pass "final: the event FINISHED by itself (heat 5 cancelled, did not block), Event Manager corrections applied, official results published, a post-publication correction wrote a new official snapshot version"

# AUDIT RECONSTRUCTION + APPEND-ONLY ---------------------------------------------------------------------------------------------------------------------
"${PSQL[@]}" -d "$DB" -f "$FV/audit.sql" >/dev/null 2>"$WORK/final/audit.err" || { grep -m3 ERROR "$WORK/final/audit.err"; fail "final: audit validation failed"; }
pass "final: audit — complete event reconstructable (check-ins + correction, VOIDs, penalties, rejected/pending actions, Master reviews, OCR attempts/retakes/reviews/corrections, 7 pause/resume cycles, SKIP, DNF, DNS); every score reproducible from the ledger; history append-only"

# EXPORT + INDEPENDENT COMPARISON ------------------------------------------------------------------------------------------------------------------------
"${PSQL[@]}" -d "$DB" -v exportfile="$WORK/final/system.json" -At -q -f "$FV/export.sql" >/dev/null 2>"$WORK/final/export.err" || { grep -m3 ERROR "$WORK/final/export.err"; fail "final: export failed"; }
[ -n "${FINAL_ARTIFACTS:-}" ] && { mkdir -p "$FINAL_ARTIFACTS"; cp "$WORK/final/system.json" "$WORK/final/plan.json" "$FINAL_ARTIFACTS/"; }
SUMMARY=$(node "$ROOT/docs/race/scripts/final-model.mjs" compare "$WORK/final/system.json" 2>&1) || { echo "$SUMMARY" | head -50; fail "final: the system disagrees with the independent model"; }
echo "$SUMMARY" | tail -2
[ -n "${FINAL_ARTIFACTS:-}" ] && echo "$SUMMARY" > "$FINAL_ARTIFACTS/model-summary.txt"
pass "final: independent model (separate code, from the rulebook) agrees with the system on every window, every action outcome, every raw score, every placement, every total and every rank"
