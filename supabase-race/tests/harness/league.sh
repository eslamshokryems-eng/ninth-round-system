# Sourced by run.sh (needs: PSQL array, HERE, ROOT, WORK, apply(), step()). The PROPOSED league migration is applied ONLY here, to a separate throw-away
# database (race_league_test) of the throw-away cluster, after the real migrations. supabase/migrations is never modified; nothing here can reach a real project.
LDB=race_league_test
"${PSQL[@]}" -d postgres -c "create database $LDB" >/dev/null
lapply() { "${PSQL[@]}" -d "$LDB" -f "$1" >/dev/null; }
lapply "$HERE/supabase-shim.sql"
for f in "$ROOT"/supabase-race/supabase/migrations/*.sql; do lapply "$f"; done
PROPOSED="$ROOT/supabase-race/proposed/league"
for f in "$PROPOSED"/*.sql; do case "$f" in *.rollback.sql) continue;; esac; lapply "$f"; echo "  ok  proposed: $(basename "$f")"; done
"${PSQL[@]}" -d "$LDB" -f "$HERE/helpers.sql" >/dev/null
"${PSQL[@]}" -d "$LDB" -c "create table race_test.league_parity (doc jsonb not null); grant select on race_test.league_parity to public" >/dev/null
"${PSQL[@]}" -d "$LDB" -c "insert into race_test.league_parity values (\$json\$$(cat "$ROOT/packages/league/domain/parity-cases.json")\$json\$::jsonb)" >/dev/null
"${PSQL[@]}" -d "$LDB" -c "create table race_test.league_differential (doc jsonb not null); grant select on race_test.league_differential to public" >/dev/null
{ printf 'insert into race_test.league_differential values ($json$'; cat "$ROOT/packages/league/domain/differential-cases.json"; printf '$json$::jsonb);\n'; } > "$WORK/diff.sql"   # too large for one argv entry
"${PSQL[@]}" -d "$LDB" -q -f "$WORK/diff.sql" >/dev/null
ltotal=0
for t in "$HERE"/league/*.sql; do
  echo "-- league/$(basename "$t")"
  if ! "${PSQL[@]}" -d "$LDB" -f "$t" > "$WORK/out" 2>&1; then
    { grep -oE 'PASS  .*' "$WORK/out" || true; }; grep -E 'ERROR|FAIL' "$WORK/out" || true; exit 1
  fi
  grep -oE 'PASS  .*' "$WORK/out" || true
  ltotal=$((ltotal + $(grep -c 'NOTICE:  PASS' "$WORK/out" || true)))
done
echo "== $ltotal league assertions passed"

# --- real parallel sessions -------------------------------------------------------------------------------------------------------------------------
lq() { "${PSQL[@]}" -d "$LDB" -At -c "$1"; }
lpass() { echo "PASS  $1"; }
lfail() { echo "FAIL  $1"; exit 1; }
fx() { lq "select id from race_test.fx where key = '$1'"; }
JUDGE=$(fx cc_judge); ADMIN=$(fx super); CC1=$(fx cc_c1); CC2=$(fx cc_c2); CC3=$(fx cc_c3); P1=$(fx cc_p1); P2=$(fx cc_p2)
mkdir -p "$WORK/lc"; rm -f "$WORK/lc"/*
lbarrier() { ( "${PSQL[@]}" -d "$LDB" -c "select pg_advisory_lock(778); select pg_sleep($1)" >/dev/null 2>&1 & ); sleep 0.7; }
as_user() { # $1 uid, $2 sql, $3 out file
  "${PSQL[@]}" -d "$LDB" -At -c "select set_config('request.jwt.claim.sub', '$1', false); set role authenticated; select pg_advisory_lock_shared(778); select pg_advisory_unlock_shared(778); $2" > "$WORK/lc/$3.out" 2> "$WORK/lc/$3.err" || true
}
# 1. one request id submitted 10 times at once -> exactly ONE attempt
RID=$(lq "select gen_random_uuid()")
lbarrier 4
for n in $(seq 1 10); do as_user "$JUDGE" "select race_league_record_attempt('$CC1', '$P1', 30, null, '$RID')" "dup$n" & done
wait; sleep 1
[ "$(lq "select count(*) from race_league_attempts where challenge_id = '$CC1' and participant_id = '$P1'")" = "1" ] || lfail "league concurrency: one request id created more than one attempt"
[ "$(cat "$WORK"/lc/dup*.err | grep -c ERROR || true)" = "0" ] || lfail "league concurrency: a replayed request failed instead of replaying"
lpass "league concurrency: ONE request id sent 10 times at once -> exactly 1 attempt, 0 errors (9 idempotent replays)"
# 2. eight DIFFERENT requests at once against a limit of 2 -> exactly 2 accepted
lbarrier 4
for n in $(seq 1 8); do as_user "$JUDGE" "select race_league_record_attempt('$CC2', '$P2', 10 + $n, null, gen_random_uuid())" "lim$n" & done
wait; sleep 1
[ "$(lq "select count(*) from race_league_attempts where challenge_id = '$CC2' and participant_id = '$P2'")" = "2" ] || lfail "league concurrency: the attempt limit of 2 was exceeded under parallel submissions"
[ "$(cat "$WORK"/lc/lim*.err | grep -c LEAGUE_ATTEMPT_LIMIT || true)" = "6" ] || lfail "league concurrency: expected 6 LEAGUE_ATTEMPT_LIMIT refusals"
lpass "league concurrency: 8 simultaneous attempts against a limit of 2 -> exactly 2 stored, 6 refused with LEAGUE_ATTEMPT_LIMIT"
# 3. six administrators close the same challenge at once -> points awarded exactly once
lbarrier 4
for n in $(seq 1 6); do as_user "$ADMIN" "select race_league_set_challenge_status('$CC3', 'closed')" "close$n" & done
wait; sleep 1
[ "$(lq "select count(*) from race_league_challenges where id = '$CC3' and status = 'closed'")" = "1" ] || lfail "league concurrency: the challenge is not closed"
[ "$(lq "select count(*) from race_league_points_ledger where challenge_id = '$CC3'")" = "6" ] || lfail "league concurrency: points were not awarded exactly once (ledger lines: $(lq "select count(*) from race_league_points_ledger where challenge_id = '$CC3'"))"
[ "$(cat "$WORK"/lc/close*.out "$WORK"/lc/close*.err | grep -c 'ledgerLines' || true)" = "1" ] || lfail "league concurrency: more than one closer reported awarding points"
lpass "league concurrency: 6 simultaneous CLOSE requests -> closed once, 6 ledger lines (one per participant), never doubled"
# 4. six simultaneous recomputes -> still nothing appended
lbarrier 4
for n in $(seq 1 6); do as_user "$ADMIN" "select race_league_recompute('$CC3')" "rec$n" & done
wait; sleep 1
[ "$(lq "select count(*) from race_league_points_ledger where challenge_id = '$CC3'")" = "6" ] || lfail "league concurrency: parallel recomputes appended duplicate lines"
lpass "league concurrency: 6 simultaneous recomputes -> the ledger is unchanged (exactly-once accounting)"

# 5. two parallel removals of two different administrators of a live season with three administrators -> exactly one succeeds, two remain
RS=$(fx cc_roles); A1=$(fx cc_adm1); A2=$(fx cc_adm2); SUPER=$(fx super)
lbarrier 4
as_user "$SUPER" "select race_league_set_staff('$RS', '$A1', 'LEAGUE_ADMIN', false, 'parallel removal one')" "rm1" &
as_user "$SUPER" "select race_league_set_staff('$RS', '$A2', 'LEAGUE_ADMIN', false, 'parallel removal two')" "rm2" &
wait; sleep 1
[ "$(lq "select count(*) from race_league_staff where season_id = '$RS' and role = 'LEAGUE_ADMIN' and active")" = "2" ] || lfail "league concurrency: two parallel removals left $(lq "select count(*) from race_league_staff where season_id = '$RS' and role = 'LEAGUE_ADMIN' and active") administrators in a live season"
[ "$(cat "$WORK"/lc/rm1.out "$WORK"/lc/rm2.out | grep -c 'changed' || true)" = "1" ] || lfail "league concurrency: both parallel removals reported success"
[ "$(cat "$WORK"/lc/rm1.err "$WORK"/lc/rm2.err | grep -c 'two independent league administrators' || true)" = "1" ] || lfail "league concurrency: the losing removal was not refused with the administrator rule"
lpass "league concurrency: 2 simultaneous removals from a live season with 3 administrators -> exactly one succeeds, the other is refused, two administrators remain"

# the same isolation checks the main database passes, now with the league objects present (verify_deployment.sql pins exact object counts; its numbers change at activation)
"${PSQL[@]}" -d "$LDB" -f "$HERE/isolation.sql" 2>&1 | sed -n 's/^.*NOTICE:  //p'

# --- rollback rehearsal: migrations -> snapshot of object counts -> proposed migration -> proposed rollback -> counts identical -> migration applies again ----------------
RDB=race_league_rb_test
"${PSQL[@]}" -d postgres -c "create database $RDB" >/dev/null
rapply() { "${PSQL[@]}" -d "$RDB" -q -f "$1" >/dev/null; }
rq() { "${PSQL[@]}" -d "$RDB" -At -c "$1"; }
objects() { rq "select (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','S','v','m')) || ':' || (select count(*) from pg_proc where pronamespace = 'public'::regnamespace) || ':' || (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal) || ':' || (select count(*) from pg_policies where schemaname = 'public') || ':' || (select count(*) from pg_type where typnamespace = 'public'::regnamespace and typtype = 'e')"; }
rapply "$HERE/supabase-shim.sql"
for f in "$ROOT"/supabase-race/supabase/migrations/*.sql; do rapply "$f"; done
BEFORE=$(objects)
rapply "$PROPOSED/20261101000001_race_league.sql"
DURING=$(objects)
[ "$BEFORE" != "$DURING" ] || lfail "league rollback: the migration changed nothing?"
rapply "$PROPOSED/20261101000001_race_league.rollback.sql"
AFTER=$(objects)
[ "$BEFORE" = "$AFTER" ] || lfail "league rollback: objects differ after rollback (before $BEFORE, after $AFTER)"
[ "$(rq "select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname like 'race\\_league\\_%'")" = "0" ] || lfail "league rollback: league tables remain"
rapply "$PROPOSED/20261101000001_race_league.sql"
[ "$(objects)" = "$DURING" ] || lfail "league rollback: re-applying the migration after a rollback gives a different schema"
lpass "league rollback: migration ($BEFORE -> $DURING objects) then rollback restores exactly $AFTER; the migration applies again identically"
