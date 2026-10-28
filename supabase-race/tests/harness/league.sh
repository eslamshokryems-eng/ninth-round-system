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
"${PSQL[@]}" -d "$LDB" -c "create table race_test.league_layout_cases (d jsonb not null); grant select on race_test.league_layout_cases to public" >/dev/null
{ printf 'insert into race_test.league_layout_cases values ($json$'; cat "$ROOT/packages/league/domain/layout-cases.json"; printf '$json$::jsonb);\n'; } > "$WORK/layout.sql"
"${PSQL[@]}" -d "$LDB" -q -f "$WORK/layout.sql" >/dev/null
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

# --- station layouts under real parallel sessions (fixtures: suite 42) ---------------------------------------------------------------------------------
SJ=$(fx sc_judge); SC1=$(fx sc_c1); SC2=$(fx sc_c2); SC3=$(fx sc_c3); SC4=$(fx sc_c4); SP1=$(fx sc_p1); SP2=$(fx sc_p2); SUPER2=$(fx super)
SV3='[{"position":1,"value":5},{"position":2,"value":6},{"position":3,"value":7}]'
# 6. one request id submitted as a STATION attempt 10 times at once -> exactly ONE attempt with ONE set of three station rows
RID=$(lq "select gen_random_uuid()")
lbarrier 4
for n in $(seq 1 10); do as_user "$SJ" "select race_league_record_station_attempt('$SC1', '$SP1', 1, '$SV3'::jsonb, null, '$RID')" "sdup$n" & done
wait; sleep 1
[ "$(lq "select count(*) from race_league_attempts where challenge_id = '$SC1' and participant_id = '$SP1'")" = "1" ] || lfail "station concurrency: one request id created more than one attempt"
[ "$(lq "select count(*) from race_league_station_results r join race_league_attempts a on a.id = r.attempt_id where a.challenge_id = '$SC1'")" = "3" ] || lfail "station concurrency: the single attempt does not have exactly three station rows"
[ "$(cat "$WORK"/lc/sdup*.err | grep -c ERROR || true)" = "0" ] || lfail "station concurrency: a replayed station request failed instead of replaying"
[ "$(lq "select a.value from race_league_attempts a where a.challenge_id = '$SC1'")" = "18.000" ] || lfail "station concurrency: the attempt value is not the sum of its stations"
lpass "station concurrency: ONE request id sent 10 times at once -> exactly 1 attempt, 3 station rows, 0 errors (9 idempotent replays)"
# 7. eight DIFFERENT station requests at once against a limit of 2 -> exactly 2 accepted, 6 refused, no orphan station rows
lbarrier 4
for n in $(seq 1 8); do as_user "$SJ" "select race_league_record_station_attempt('$SC2', '$SP2', 1, '[{\"position\":1,\"value\":$n},{\"position\":2,\"value\":2},{\"position\":3,\"value\":3}]'::jsonb, null, gen_random_uuid())" "slim$n" & done
wait; sleep 1
[ "$(lq "select count(*) from race_league_attempts where challenge_id = '$SC2' and participant_id = '$SP2'")" = "2" ] || lfail "station concurrency: the attempt limit of 2 was exceeded under parallel station submissions"
[ "$(cat "$WORK"/lc/slim*.err | grep -c LEAGUE_ATTEMPT_LIMIT || true)" = "6" ] || lfail "station concurrency: expected 6 LEAGUE_ATTEMPT_LIMIT refusals"
[ "$(lq "select count(*) from race_league_station_results r join race_league_attempts a on a.id = r.attempt_id where a.challenge_id = '$SC2'")" = "6" ] || lfail "station concurrency: a refused submission left station rows behind (or an accepted one has none)"
lpass "station concurrency: 8 simultaneous station attempts against a limit of 2 -> exactly 2 stored (6 station rows), 6 refused with LEAGUE_ATTEMPT_LIMIT, no orphan rows"
# 8. six administrators substitute exercises at the same time -> six DISTINCT new versions, none lost, none duplicated
lbarrier 4
for n in $(seq 1 6); do as_user "$SUPER2" "select race_league_set_layout('$SC3', '{\"result_type\":\"REPS\",\"stations\":[{\"name\":\"A\",\"exercises\":[{\"name\":\"Variant $n\"}]},{\"name\":\"B\",\"exercises\":[{\"name\":\"Two\"}]},{\"name\":\"C\",\"exercises\":[{\"name\":\"Three\"}]}]}'::jsonb, 'parallel swap $n')" "swap$n" & done
wait; sleep 1
[ "$(cat "$WORK"/lc/swap*.err | grep -c ERROR || true)" = "0" ] || lfail "station concurrency: a parallel substitution failed: $(cat "$WORK"/lc/swap*.err | head -3)"
[ "$(lq "select count(*) from race_league_layouts where challenge_id = '$SC3'")" = "7" ] || lfail "station concurrency: expected 7 layout versions (1 + 6 substitutions), found $(lq "select count(*) from race_league_layouts where challenge_id = '$SC3'")"
[ "$(lq "select string_agg(version::text, ',' order by version) from race_league_layouts where challenge_id = '$SC3'")" = "1,2,3,4,5,6,7" ] || lfail "station concurrency: layout versions are not 1..7 without gaps or duplicates"
[ "$(lq "select count(*) from race_league_layouts l where l.challenge_id = '$SC3' and l.station_count <> (select count(*) from race_league_layout_stations s where s.layout_id = l.id)")" = "0" ] || lfail "station concurrency: a version has a different number of station rows than it declares"
lpass "station concurrency: 6 simultaneous substitutions -> versions 1..7, none lost, none duplicated, every version complete"
# 9. the FIRST layout races six single-value attempts on the same challenge -> exactly one world: the layout exists and no stray attempt, or the attempts exist and no layout
PIDS=$(lq "select string_agg(id::text, ' ') from (select id from race_league_participants where season_id = (select season_id from race_league_challenges where id = '$SC4') order by display_name) x")
lbarrier 4
as_user "$SUPER2" "select race_league_set_layout('$SC4', '{\"result_type\":\"REPS\",\"stations\":[{\"name\":\"A\",\"exercises\":[{\"name\":\"One\"}]},{\"name\":\"B\",\"exercises\":[{\"name\":\"Two\"}]}]}'::jsonb, 'first layout racing attempts')" "first" &
n=0; for pid in $PIDS; do n=$((n + 1)); as_user "$SJ" "select race_league_record_attempt('$SC4', '$pid', 10 + $n, null, gen_random_uuid())" "late$n" & done
wait; sleep 1
LAY=$(lq "select count(*) from race_league_layouts where challenge_id = '$SC4'"); ATT=$(lq "select count(*) from race_league_attempts where challenge_id = '$SC4'")
if [ "$LAY" = "1" ]; then
  [ "$ATT" = "0" ] || lfail "station concurrency: a layout and $ATT attempt(s) without a breakdown coexist on one challenge"
  [ "$(cat "$WORK"/lc/late*.err | grep -c 'one value per station' || true)" = "6" ] || lfail "station concurrency: the six single-value attempts were not all refused at commit"
  WORLD="the layout won: 6 single-value attempts refused at commit, 0 stored"
else
  [ "$LAY" = "0" ] && [ "$ATT" -ge 1 ] || lfail "station concurrency: inconsistent outcome (layouts $LAY, attempts $ATT)"
  grep -q "before the first attempt" "$WORK/lc/first.err" || lfail "station concurrency: the layout request lost the race but was not refused with 'before the first attempt'"
  WORLD="the attempts won: $ATT stored, the layout was refused"
fi
lpass "station concurrency: the first layout racing six single-value attempts -> a consistent world ($WORLD)"

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

# --- station-layout rehearsal: base -> stations -> stations rollback restores the base exactly -> stations again -> base rollback removes EVERYTHING league ---------------------
SRB=race_league_st_rb_test
"${PSQL[@]}" -d postgres -c "create database $SRB" >/dev/null
RDB=$SRB   # rapply / rq / objects above read $RDB when they run
rapply "$HERE/supabase-shim.sql"
for f in "$ROOT"/supabase-race/supabase/migrations/*.sql; do rapply "$f"; done
S0=$(objects)
rapply "$PROPOSED/20261101000001_race_league.sql"
S1=$(objects)
rapply "$PROPOSED/20261101000002_race_league_stations.sql"
S2=$(objects)
[ "$S1" != "$S2" ] || lfail "station rollback: the stations migration changed nothing?"
[ "$(rq "select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname in ('race_league_layouts','race_league_layout_stations','race_league_layout_exercises','race_league_station_results')")" = "4" ] || lfail "station rollback: the four station tables are missing after the migration"
rapply "$PROPOSED/20261101000002_race_league_stations.rollback.sql"
S3=$(objects)
[ "$S1" = "$S3" ] || lfail "station rollback: objects differ after the stations rollback (base $S1, after $S3)"
[ "$(rq "select count(*) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'race_league_record_attempt'")" = "1" ] || lfail "station rollback: the base league lost a function"
[ "$(rq "select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relname in ('race_league_attempts','race_league_challenges') and t.tgname in ('trg_race_league_attempt_stations','trg_race_league_challenges_layout_metric')")" = "0" ] || lfail "station rollback: a station trigger remains on a base table"
rapply "$PROPOSED/20261101000002_race_league_stations.sql"
[ "$(objects)" = "$S2" ] || lfail "station rollback: re-applying the stations migration after a rollback gives a different schema"
lpass "station rollback: base ($S1) -> stations ($S2) -> stations rollback restores exactly the base ($S3) -> stations again identical"
rapply "$PROPOSED/20261101000001_race_league.rollback.sql"
S4=$(objects)
[ "$S0" = "$S4" ] || lfail "station rollback: the BASE rollback with the stations applied left objects behind (before any league $S0, after $S4)"
[ "$(rq "select count(*) from pg_class where relnamespace = 'public'::regnamespace and relname like 'race\\_league\\_%'")" = "0" ] || lfail "station rollback: league tables remain after the base rollback"
lpass "station rollback: the BASE rollback also removes the station objects ($S2 -> $S4 = the race engine alone, as before any league)"

