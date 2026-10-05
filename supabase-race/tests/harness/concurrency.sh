# Sourced by run.sh (needs: PSQL array, DB, WORK). Real parallel sessions —
# what SQL suites in one session cannot prove.
FOUNDER=aea7db27-3aaa-4701-aed2-f1b49127bdda
q() { "${PSQL[@]}" -d "$DB" -At -c "$1"; }
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; exit 1; }

# --- Fixture events (as the founder / super admin) ---------------------------------
EV=$(q "select set_config('request.jwt.claim.sub','$FOUNDER',false)::text is not null; select race_create_event('concurrency-free',date '2027-01-10')" | tail -1)
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_set_event_status('$EV','REGISTRATION_OPEN')" >/dev/null
EVP=$(q "select set_config('request.jwt.claim.sub','$FOUNDER',false)::text is not null; select race_create_event('concurrency-paid',date '2027-01-10')" | tail -1)
q "update race_events set registration_fee = 500 where id = '$EVP'; select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_set_event_status('$EVP','REGISTRATION_OPEN')" >/dev/null

mkdir -p "$WORK/c"; rm -f "$WORK/c"/*

# Barrier: the controller holds advisory lock 777 exclusively; every worker connects, blocks on a
# shared lock, and is released at the same instant — so the workers genuinely collide instead of
# being staggered by process start-up time.
barrier_hold() { ( "${PSQL[@]}" -d "$DB" -c "select pg_advisory_lock(777); select pg_sleep($1)" >/dev/null 2>&1 & ); sleep 0.7; }

reg() { # $1=person index, $2=output file, $3=event
  "${PSQL[@]}" -d "$DB" -At -c "set role anon; select pg_advisory_lock_shared(777); select pg_advisory_unlock_shared(777); select race_number from race_register_athlete('$3','Racer $1','010$(printf %08d "$1")',null,'male','1990-01-01','MEN',null,true,'{\"name\":\"C\",\"phone\":\"01011112222\"}'::jsonb)" \
    > "$WORK/c/$2.out" 2> "$WORK/c/$2.err" || true
}

# --- 1. 40 simultaneous registrations: 30 people, person #1 submitted 11 times at once ----------
barrier_hold 5
for p in $(seq 1 30); do reg "$p" "p$p" "$EV" & done
for d in $(seq 1 10); do reg 1 "dup$d" "$EV" & done
wait
sleep 1
ok=$(cat "$WORK"/c/*.out | grep -c '^N' || true)
distinct=$(cat "$WORK"/c/*.out | grep '^N' | sort -u | wc -l)
[ "$ok" = "30" ] && [ "$distinct" = "30" ] || fail "concurrency: expected 30 distinct successful registrations, got ok=$ok distinct=$distinct"
pass "concurrency: 40 parallel submissions → exactly 30 registrations (person #1 submitted 11× simultaneously → 1)"
nums=$(q "select string_agg(race_number, ',' order by race_number) from race_registrations where event_id='$EV'")
want=$(python3 -c "print(','.join('N%03d'%i for i in range(1,31)))")
[ "$nums" = "$want" ] || fail "concurrency: race numbers not N001..N030 gapless: $nums"
pass "concurrency: race numbers are exactly N001–N030 — unique, gapless, despite 10 refused duplicates racing the originals"
a1=$(q "select count(*) from race_athletes where full_name='Racer 1' and phone_normalized='01000000001'")
[ "$a1" = "1" ] || fail "concurrency: duplicate athlete rows created for one person ($a1)"
pass "concurrency: one athlete row for the person who was submitted 11× at once"
dups=$(grep -l 'RACE_ALREADY_REGISTERED' "$WORK"/c/dup*.err "$WORK"/c/p1.err 2>/dev/null | wc -l)
[ "$dups" = "10" ] || fail "concurrency: expected 10 RACE_ALREADY_REGISTERED refusals, got $dups"
pass "concurrency: the 10 losers all got RACE_ALREADY_REGISTERED (not a crash, not a second number)"
c=$(q "select last_number from race_event_counters where event_id='$EV'")
[ "$c" = "30" ] || fail "concurrency: counter is $c, expected 30 (a refused attempt consumed a number)"
pass "concurrency: counter = 30 — refused attempts consumed no numbers"

# --- 2. Double-click on 'confirm payment': same idempotency key, 12 sessions at once ------------
q "set role anon; select race_number from race_register_athlete('$EVP','Payer One','01099990001',null,'male','1990-01-01','MEN',null,true,'{\"name\":\"C\",\"phone\":\"01011112222\"}'::jsonb)" >/dev/null
REG=$(q "select id from race_registrations where event_id='$EVP' and race_number='N001'")
pay() { # $1=out, $2=idempotency key or NULL
  "${PSQL[@]}" -d "$DB" -At -c "select set_config('request.jwt.claim.sub','$FOUNDER',false); set role authenticated; select pg_advisory_lock_shared(777); select pg_advisory_unlock_shared(777); select race_confirm_payment('$REG','CASH',null,null,$2)" \
    > "$WORK/c/$1.out" 2> "$WORK/c/$1.err" || true
}
barrier_hold 3
for n in $(seq 1 12); do pay "k$n" "'receipt-42'" & done
wait
sleep 1
ids=$(cat "$WORK"/c/k*.out | grep -E '^[0-9a-f-]{36}$' | grep -v "$FOUNDER" | sort -u | wc -l)
succ=$(cat "$WORK"/c/k*.out | grep -E '^[0-9a-f-]{36}$' | grep -vc "$FOUNDER" || true)
rows=$(q "select count(*) from race_payments where registration_id='$REG' and status='PAID'")
[ "$ids" = "1" ] && [ "$succ" = "12" ] && [ "$rows" = "1" ] || fail "concurrency: idempotent confirm — distinct ids=$ids successes=$succ paid rows=$rows"
pass "concurrency: 12 simultaneous confirms with one idempotency key → 12 identical answers, exactly 1 PAID payment"

REG2_NUM=$(q "set role anon; select race_number from race_register_athlete('$EVP','Payer Two','01099990002',null,'male','1990-01-01','MEN',null,true,'{\"name\":\"C\",\"phone\":\"01011112222\"}'::jsonb)")
REG=$(q "select id from race_registrations where event_id='$EVP' and race_number='$REG2_NUM'")
rm -f "$WORK"/c/n*.out "$WORK"/c/n*.err
barrier_hold 3
for n in $(seq 1 12); do pay "n$n" "NULL" & done
wait
sleep 1
succ=$(cat "$WORK"/c/n*.out | grep -E '^[0-9a-f-]{36}$' | grep -vc "$FOUNDER" || true)
already=$(grep -l 'RACE_ALREADY_PAID' "$WORK"/c/n*.err | wc -l || true)
rows=$(q "select count(*) from race_payments where registration_id='$REG'")
paid=$(q "select count(*) from race_payments where registration_id='$REG' and status='PAID'")
[ "$succ" = "1" ] && [ "$already" = "11" ] && [ "$rows" = "1" ] && [ "$paid" = "1" ] || fail "concurrency: keyless confirm — successes=$succ already_paid=$already rows=$rows paid=$paid"
pass "concurrency: 12 simultaneous keyless confirms → exactly 1 succeeds, 11 get RACE_ALREADY_PAID, 1 payment row"

# --- 3. Cancel vs pay race: registration cannot end up PAID + CANCELLED without a refund ------------
q "set role anon; select race_number from race_register_athlete('$EVP','Payer Three','01099990003',null,'male','1990-01-01','MEN',null,true,'{\"name\":\"C\",\"phone\":\"01011112222\"}'::jsonb)" >/dev/null
REG3=$(q "select id from race_registrations where event_id='$EVP' and athlete_id=(select id from race_athletes where full_name='Payer Three')")
rm -f "$WORK"/c/x*.out "$WORK"/c/x*.err
( "${PSQL[@]}" -d "$DB" -At -c "select set_config('request.jwt.claim.sub','$FOUNDER',false); set role authenticated; select race_confirm_payment('$REG3','CASH')" >"$WORK/c/x1.out" 2>"$WORK/c/x1.err" || true ) &
( "${PSQL[@]}" -d "$DB" -At -c "select set_config('request.jwt.claim.sub','$FOUNDER',false); set role authenticated; select race_cancel_registration('$REG3','changed mind')" >"$WORK/c/x2.out" 2>"$WORK/c/x2.err" || true ) &
wait
bad=$(q "select count(*) from race_registrations r join race_payments p on p.registration_id = r.id where r.id='$REG3' and r.status='CANCELLED' and p.status='PAID'")
[ "$bad" = "0" ] || fail "concurrency: registration ended CANCELLED with a PAID payment and no refund"
pass "concurrency: a pay-vs-cancel race never leaves a CANCELLED registration holding a PAID payment"

# ============================ Phase 5: check-in + binder ============================
setup_checkin_event() { # $1=slug $2=athletes (last one goes to heat 2) -> echoes the event id
  local slug=$1 n=$2 ev
  ev=$(q "select set_config('request.jwt.claim.sub','$FOUNDER',false)::text is not null; select race_create_event('$slug',date '2027-02-01','THE NINTH','Africa/Cairo', timestamptz '2027-02-01 07:00:00+00')" | tail -1)
  q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_set_event_status('$ev','REGISTRATION_OPEN')" >/dev/null
  for i in $(seq 1 "$n"); do
    q "set role anon; select race_number from race_register_athlete('$ev','CI $slug $i','0188$(printf %07d "$i")',null,'male','1990-01-01','MEN',null,true,'{\"name\":\"C\",\"phone\":\"01011112222\"}'::jsonb)" >/dev/null
  done
  q "insert into race_heats (event_id, number) values ('$ev',1),('$ev',2)" >/dev/null
  q "update race_registrations set heat_id = (select id from race_heats where event_id='$ev' and number = case when race_number = 'N$(printf %03d "$n")' and $n > 9 then 2 else 1 end) where event_id='$ev'" >/dev/null
  q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_lock_heats('$ev')" >/dev/null
  echo "$ev"
}
regid() { q "select id from race_registrations where event_id='$1' and race_number='N$(printf %03d "$2")'"; }
checkin() { # $1=out file $2=registration id
  "${PSQL[@]}" -d "$DB" -At -c "select set_config('request.jwt.claim.sub','$FOUNDER',false); set role authenticated; select pg_advisory_lock_shared(777); select pg_advisory_unlock_shared(777); select queue_position || '|' || already_checked_in || '|' || checked_in_at from race_check_in('$2')" \
    > "$WORK/c/$1.out" 2> "$WORK/c/$1.err" || true
}

# --- 1. Nine athletes check in at the same instant, one heat ---------------------------------------------------------------
EVC=$(setup_checkin_event concurrency-checkin 10)
rm -f "$WORK"/c/ci*
barrier_hold 3
for i in $(seq 1 9); do checkin "ci$i" "$(regid "$EVC" "$i")" & done
wait; sleep 1
ok=$(cat "$WORK"/c/ci?.out | grep -cE '^[0-9]+\|false\|' || true)
positions=$(cat "$WORK"/c/ci?.out | grep -E '^[0-9]+\|false\|' | cut -d'|' -f1 | sort -n | tr '\n' ',')
[ "$ok" = "9" ] && [ "$positions" = "1,2,3,4,5,6,7,8,9," ] || fail "concurrency: 9 simultaneous check-ins gave ok=$ok positions=$positions"
pass "concurrency: 9 simultaneous check-ins in one heat → positions exactly 1..9, each used once"
distinct_ts=$(q "select count(distinct checked_in_at) from race_check_ins where event_id='$EVC'")
[ "$distinct_ts" = "9" ] || fail "concurrency: check-in timestamps are not all distinct ($distinct_ts of 9) — an exact tie would need a draw"
pass "concurrency: 9 distinct server timestamps (the heat lock serialises check-ins, so ties do not occur in live operation)"
# the position each caller was told must equal the order of the recorded timestamps
told=$(for i in $(seq 1 9); do echo "$(cut -d'|' -f1 "$WORK/c/ci$i.out" | tail -1) $(regid "$EVC" "$i")"; done | sort -n | awk '{print $2}' | tr '\n' ',')
actual=$(q "select string_agg(registration_id::text, ',' order by checked_in_at) from race_check_ins where event_id='$EVC'")
[ "${told%,}" = "$actual" ] || fail "concurrency: the position told to each caller does not match timestamp order"
pass "concurrency: the position each desk was told equals the order of the recorded server timestamps"
draws=$(q "select count(*) from race_tie_draws where event_id='$EVC'")
[ "$draws" = "0" ] || fail "concurrency: unexpected tie draws ($draws)"
pass "concurrency: no tie draws were needed"

# --- 2. Ten desks double-click the same athlete ----------------------------------------------------------------------------------------
R10=$(regid "$EVC" 10)
rm -f "$WORK"/c/dc*
barrier_hold 3
for n in $(seq 1 10); do checkin "dc$n" "$R10" & done
wait; sleep 1
rows=$(q "select count(*) from race_check_ins where registration_id='$R10'")
fresh=$(cat "$WORK"/c/dc*.out | grep -cE '^1\|false\|' || true)
dupes=$(cat "$WORK"/c/dc*.out | grep -cE '^1\|true\|' || true)
[ "$rows" = "1" ] && [ "$fresh" = "1" ] && [ "$dupes" = "9" ] || fail "concurrency: double-click — rows=$rows first=$fresh repeats=$dupes"
pass "concurrency: 10 simultaneous check-ins of one athlete → 1 row; 1 real check-in, 9 told 'already checked in'"

# --- 3. Check-ins racing the slot binder, on a moving clock ------------------------------------------------------------------------------
# Athletes arrive one by one while a "clock advancer" makes a new slot fall due every 0.25 s and the binder runs
# continuously in parallel — so binds and check-ins genuinely interleave. Invariants must hold whatever the interleaving.
EVB=$(setup_checkin_event concurrency-binder 9)
q "select race_freeze_schedule('$EVB'); update race_clock set started_at = clock_timestamp() where event_id='$EVB'" >/dev/null
rm -f "$WORK"/c/ck* "$WORK"/c/bind_done
(
  for t in $(seq 1 10); do sleep 0.25; q "update race_clock set started_at = started_at - interval '210 seconds' where event_id='$EVB'" >/dev/null; done
) &
(
  for _ in $(seq 1 80); do "${PSQL[@]}" -d "$DB" -At -c "select * from race_bind_due_slots('$EVB')" >/dev/null 2>&1; sleep 0.04; done
  touch "$WORK/c/bind_done"
) &
for i in $(seq 1 9); do sleep 0.2; checkin "ck$i" "$(regid "$EVB" "$i")" & done
wait
q "select * from race_bind_due_slots('$EVB')" >/dev/null
arrived=$(q "select count(*) from race_check_ins where event_id='$EVB'")
inv=$(q "select count(*) from race_start_slots s1 join race_start_slots s2 on s1.heat_id = s2.heat_id and s1.slot_index < s2.slot_index
          join race_check_ins c1 on c1.registration_id = s1.registration_id join race_check_ins c2 on c2.registration_id = s2.registration_id
         where s1.event_id='$EVB' and c1.voided_by_correction_id is null and c2.voided_by_correction_id is null
           and (c1.checked_in_at, coalesce(c1.tie_draw_position, 0)) > (c2.checked_in_at, coalesce(c2.tie_draw_position, 0))")
bound=$(q "select count(*) from race_start_slots where event_id='$EVB' and registration_id is not null")
empty=$(q "select count(*) from race_start_slots where event_id='$EVB' and status='EMPTY'")
twice=$(q "select count(*) from (select registration_id from race_start_slots where event_id='$EVB' and registration_id is not null group by 1 having count(*) > 1) x")
[ "$arrived" = "9" ] && [ "$inv" = "0" ] && [ "$twice" = "0" ] && [ "$bound" -ge 4 ] || fail "concurrency: binder race — arrived=$arrived order violations=$inv double-bound=$twice bound=$bound empty=$empty"
pass "concurrency: 9 staggered check-ins + a moving clock + 80 continuous binder passes → start order == check-in order ($bound bound, $empty burned, nobody bound twice, 0 order inversions)"

# ============================ Phase 6: engine, clock, skip, corrections ============================
# An event with $2 athletes in heat 1, all checked in, heats locked. As the founder (super admin).
setup_engine_event() { # $1=slug $2=athletes -> echoes the event id
  local ev; ev=$(setup_checkin_event "$1" "$2")
  for i in $(seq 1 "$2"); do
    q "select set_config('request.jwt.claim.sub','$FOUNDER',false); set role authenticated; select race_check_in('$(regid "$ev" "$i")')" >/dev/null
  done
  echo "$ev"
}
as_founder() { echo "select set_config('request.jwt.claim.sub','$FOUNDER',false); set role authenticated; select pg_advisory_lock_shared(777); select pg_advisory_unlock_shared(777);"; }
call() { # $1=out name  $2=sql
  "${PSQL[@]}" -d "$DB" -At -c "$(as_founder) $2" > "$WORK/c/$1.out" 2> "$WORK/c/$1.err" || true
}
rewind() { q "update race_clock set started_at = clock_timestamp() - make_interval(secs => $2 / 1000.0), paused_at = null, paused_total_ms = 0 where event_id='$1'" >/dev/null; }

# --- 4. START EVENT pressed by 12 sessions at once ------------------------------------------------------------------------------------------
EVS=$(setup_engine_event concurrency-start 9)
rm -f "$WORK"/c/st*
barrier_hold 3
for n in $(seq 1 12); do call "st$n" "select started_at from race_start_event('$EVS')" & done
wait; sleep 1
succ=$(cat "$WORK"/c/st?.out "$WORK"/c/st??.out 2>/dev/null | grep -cE '^[0-9]{4}-' || true)
refused=$(grep -l 'RACE_ALREADY_STARTED' "$WORK"/c/st*.err 2>/dev/null | wc -l || true)
audits=$(q "select count(*) from race_audit_log where action='race.event.start' and metadata->>'event_id'='$EVS'")
ver=$(q "select version from race_clock where event_id='$EVS'")
[ "$succ" = "1" ] && [ "$refused" = "11" ] && [ "$audits" = "1" ] || fail "concurrency: START EVENT — successes=$succ refused=$refused audits=$audits version=$ver"
pass "concurrency: START EVENT from 12 sessions at once → exactly 1 starts the race, 11 get RACE_ALREADY_STARTED, 1 audit row"
[ "$(q "select count(*) from race_start_slots where event_id='$EVS'")" = "9" ] || fail "concurrency: schedule frozen more than once"
pass "concurrency: the schedule was frozen exactly once (9 slots)"

# --- 5. 20 sessions tick the engine simultaneously at a moment when every athlete is due ---------------------------------------------------------
rewind "$EVS" 2000000
rm -f "$WORK"/c/ad*
barrier_hold 3
for n in $(seq 1 20); do call "ad$n" "select race_advance('$EVS')::text; select race_advance('$EVS')::text; select race_advance('$EVS')::text" & done
wait; sleep 1
busy=$(cat "$WORK"/c/ad*.out | grep -c '"busy": true' || true)
ran=$(cat "$WORK"/c/ad*.out | grep -c '"advanced": true' || true)
started=$(q "select count(*) from race_registrations where event_id='$EVS' and race_status in ('STARTED','FINISHED')")
results=$(q "select count(*) from race_station_results where event_id='$EVS'")
dupres=$(q "select count(*) from (select registration_id, station_id from race_station_results where event_id='$EVS' group by 1,2 having count(*) > 1) x")
starts=$(q "select count(*) from race_audit_log where action='race.athlete.start' and metadata->>'event_id'='$EVS'")
perreg=$(q "select count(*) from (select registration_id from race_station_results where event_id='$EVS' group by 1 having count(*) <> 9) x")
[ "$started" = "9" ] && [ "$results" = "81" ] && [ "$dupres" = "0" ] && [ "$starts" = "9" ] && [ "$perreg" = "0" ] && [ "$ran" -ge 1 ] || fail "concurrency: 20 parallel advance — started=$started results=$results dup=$dupres start-audits=$starts athletes-without-9=$perreg ran=$ran busy=$busy"
pass "concurrency: 60 engine ticks from 20 sessions → each of 9 athletes started exactly once, 81 station results (9 each), 9 start audit rows ($ran ticks ran, $busy politely deferred)"

# The try-lock is a courtesy, not the safety net: hammer the engine core with NO lock and the data must still be exact.
EVR=$(setup_engine_event concurrency-core 9)
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_start_event('$EVR')" >/dev/null
rewind "$EVR" 2000000
rm -f "$WORK"/c/co*
barrier_hold 3
for n in $(seq 1 20); do ( "${PSQL[@]}" -d "$DB" -At -c "select pg_advisory_lock_shared(777); select pg_advisory_unlock_shared(777); select race_advance_core('$EVR')::text; select race_advance_core('$EVR')::text" >"$WORK/c/co$n.out" 2>"$WORK/c/co$n.err" || true ) & done
wait; sleep 1
errs=$(cat "$WORK"/c/co*.err | grep -c . || true)
started=$(q "select count(*) from race_registrations where event_id='$EVR' and race_status in ('STARTED','FINISHED')")
results=$(q "select count(*) from race_station_results where event_id='$EVR'")
starts=$(q "select count(*) from race_audit_log where action='race.athlete.start' and metadata->>'event_id'='$EVR'")
sl=$(q "select count(*) from race_audit_log where action='race.station.start' and metadata->>'event_id'='$EVR'")
[ "$errs" = "0" ] && [ "$started" = "9" ] && [ "$results" = "81" ] && [ "$starts" = "9" ] || fail "concurrency: 40 unlocked engine ticks — errors=$errs started=$started results=$results start-audits=$starts"
pass "concurrency: 40 UNLOCKED engine ticks in parallel → no errors, no deadlock, 9 starts, 81 results, exact audit counts"
q "select race_sim.check_invariants('$EVR', race_now_ms('$EVR'))" >/dev/null && pass "concurrency: timing invariants hold after the storm"

# --- 6. Pause / resume storms ---------------------------------------------------------------------------------------------------------------------------
EVP2=$(setup_engine_event concurrency-pause 4)
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_start_event('$EVP2')" >/dev/null
rewind "$EVP2" 300000
rm -f "$WORK"/c/pa*
barrier_hold 3
for n in $(seq 1 10); do call "pa$n" "select paused_race_ms from race_pause('$EVP2','storm')" & done
wait; sleep 1
succ=$(cat "$WORK"/c/pa*.out | grep -cE '^[0-9]+$' || true)
already=$(grep -l 'RACE_ALREADY_PAUSED' "$WORK"/c/pa*.err | wc -l || true)
rows=$(q "select count(*) from race_pauses where event_id='$EVP2'")
[ "$succ" = "1" ] && [ "$already" = "9" ] && [ "$rows" = "1" ] || fail "concurrency: 10 simultaneous pauses — successes=$succ already-paused=$already rows=$rows"
pass "concurrency: 10 simultaneous EMERGENCY PAUSE presses → 1 pause row, 9 told RACE_ALREADY_PAUSED"
rm -f "$WORK"/c/re*
barrier_hold 3
for n in $(seq 1 10); do call "re$n" "select paused_ms from race_resume('$EVP2')" & done
wait; sleep 1
succ=$(cat "$WORK"/c/re*.out | grep -cE '^[0-9]+$' || true)
notp=$(grep -l 'RACE_NOT_PAUSED' "$WORK"/c/re*.err | wc -l || true)
[ "$succ" = "1" ] && [ "$notp" = "9" ] || fail "concurrency: 10 simultaneous resumes — successes=$succ not-paused=$notp"
pass "concurrency: 10 simultaneous RESUME presses → exactly 1 resumes, 9 told RACE_NOT_PAUSED"
# a storm of interleaved pauses and resumes from 8 desks
rm -f "$WORK"/c/ps*
barrier_hold 3
for n in $(seq 1 8); do
  ( "${PSQL[@]}" -d "$DB" -At -c "$(as_founder) $(for _ in $(seq 1 12); do echo "select 1 from race_pause('$EVP2','s') ; "; echo "select 1 from race_resume('$EVP2'); "; done)" >"$WORK/c/ps$n.out" 2>/dev/null || true ) &
done
wait; sleep 1
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_resume('$EVP2')" >/dev/null 2>&1 || true
open=$(q "select count(*) from race_pauses where event_id='$EVP2' and resumed_at is null")
tot=$(q "select paused_total_ms from race_clock where event_id='$EVP2'")
sum=$(q "select coalesce(sum(round(extract(epoch from (resumed_at - paused_at)) * 1000)), 0)::bigint from race_pauses where event_id='$EVP2' and resumed_at is not null")
overlap=$(q "select count(*) from race_pauses a join race_pauses b on a.id < b.id and a.paused_at < coalesce(b.resumed_at, 'infinity') and b.paused_at < coalesce(a.resumed_at, 'infinity') where a.event_id='$EVP2'")
npause=$(q "select count(*) from race_pauses where event_id='$EVP2'")
[ "$open" = "0" ] && [ "$tot" = "$sum" ] && [ "$overlap" = "0" ] && [ "$npause" -ge 2 ] || fail "concurrency: pause storm — open=$open total=$tot sum=$sum overlapping=$overlap pauses=$npause"
pass "concurrency: pause/resume storm from 8 desks → $npause pauses, none overlapping, none left open, paused_total_ms ($tot) == the exact sum of the pauses"

# --- 7. SKIP vs the engine's automatic start, slot by slot ------------------------------------------------------------------------------------------
EVK=$(setup_engine_event concurrency-skip 9)
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_start_event('$EVK')" >/dev/null
for k in $(seq 0 7); do
  start=$((60000 + k * 210000))
  rewind "$EVK" $((start - 500))
  q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_advance('$EVK')" >/dev/null     # binds slot k (60 s before its start)
  slot=$(q "select s.id from race_start_slots s join race_heats h on h.id = s.heat_id where h.event_id='$EVK' and h.number = 1 and s.slot_index = $k")
  rewind "$EVK" $((start + 300))                                                                                # the slot is now due
  rm -f "$WORK"/c/sk*
  barrier_hold 3
  call "sk1" "select slot_index from race_skip_athlete('$slot','simulated: not ready $k')" &
  for n in 2 3 4; do call "sk$n" "select race_advance('$EVK')::text" & done
  wait; sleep 0.5
  q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_advance('$EVK')" >/dev/null
done
skipped=$(q "select count(*) from race_start_slots where event_id='$EVK' and status='SKIPPED' and slot_index < 8")
missed=$(q "select count(*) from race_registrations where event_id='$EVK' and race_status='MISSED_START'")
live=$(q "select count(*) from race_station_results r join race_start_slots s on s.id = r.slot_id where s.event_id='$EVK' and s.status='SKIPPED' and r.status <> 'VOID_DNS'")
started_audits=$(q "select count(*) from race_audit_log where action='race.athlete.start' and metadata->>'event_id'='$EVK'")
with_rows=$(q "select count(distinct registration_id) from race_station_results where event_id='$EVK'")
started_slots=$(q "select count(*) from race_start_slots where event_id='$EVK' and started_at is not null")
skip_audits=$(q "select count(*) from race_audit_log where action='race.athlete.skip' and metadata->>'event_id'='$EVK'")
[ "$skipped" = "8" ] && [ "$missed" = "8" ] && [ "$live" = "0" ] && [ "$skip_audits" = "8" ] && [ "$started_audits" = "$with_rows" ] && [ "$with_rows" = "$started_slots" ] \
  || fail "concurrency: skip vs start — skipped=$skipped missed=$missed live-results=$live skip-audits=$skip_audits start-audits=$started_audits athletes-with-results=$with_rows started-slots=$started_slots"
pass "concurrency: SKIP racing the automatic start on 8 slots → every race ends the same way: slot SKIPPED, athlete MISSED_START, zero live results ($started_audits of 8 had already started when skipped — their results are void, the rest never started); audit counts consistent"
q "select race_sim.check_invariants('$EVK', race_now_ms('$EVK'))" >/dev/null && pass "concurrency: timing invariants hold after the skip races"

# --- 8. Corrections: the same wrong check-in corrected from many desks -------------------------------------------------------------------------------
EVC2=$(setup_checkin_event concurrency-correct 6)
for i in 1 2; do q "select set_config('request.jwt.claim.sub','$FOUNDER',false); set role authenticated; select race_check_in('$(regid "$EVC2" "$i")')" >/dev/null; done
rm -f "$WORK"/c/cc*
barrier_hold 3
for n in 1 2 3 4; do call "cc$n" "select correction_id from race_correct_check_in('$(regid "$EVC2" 1)','$(regid "$EVC2" 5)','wrong wristband $n')" & done
for n in 5 6 7 8; do call "cc$n" "select correction_id from race_correct_check_in('$(regid "$EVC2" 2)','$(regid "$EVC2" 5)','wrong wristband $n')" & done
wait; sleep 1
succ=$(cat "$WORK"/c/cc?.out | grep -E '^[0-9a-f-]{36}$' | grep -vc "$FOUNDER" || true)
rows=$(q "select count(*) from race_check_in_corrections where event_id='$EVC2'")
active5=$(q "select count(*) from race_check_ins where registration_id='$(regid "$EVC2" 5)' and voided_by_correction_id is null")
activeall=$(q "select count(*) from (select registration_id from race_check_ins where event_id='$EVC2' and voided_by_correction_id is null group by 1 having count(*) > 1) x")
total=$(q "select count(*) from race_check_ins where event_id='$EVC2'")
[ "$succ" = "1" ] && [ "$rows" = "1" ] && [ "$active5" = "1" ] && [ "$activeall" = "0" ] && [ "$total" = "3" ] || fail "concurrency: corrections — successes=$succ ledger=$rows active-for-#5=$active5 athletes-with-2-active=$activeall check-in-rows=$total"
pass "concurrency: 8 desks correct check-ins onto the SAME athlete at once → exactly 1 correction; nobody ends up with two active check-ins; the original rows all survive (3 check-in rows)"

# ============================ Final checkpoint: a full house and a blackout ============================
setup_big_event() { # 6 heats (9,9,9,9,9,5), 50 athletes, heats locked, nobody checked in -> echoes the event id
  local slug=$1 ev
  ev=$(q "select set_config('request.jwt.claim.sub','$FOUNDER',false)::text is not null; select race_create_event('$slug',date '2027-03-01','THE NINTH','Africa/Cairo', timestamptz '2027-03-01 07:00:00+00')" | tail -1)
  q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_set_event_status('$ev','REGISTRATION_OPEN')" >/dev/null
  q "set role anon; select count(*) from (select race_register_athlete('$ev','Big '||i,'0199'||lpad(i::text,7,'0'),null,'male','1990-01-01','MEN',null,true,'{\"name\":\"C\",\"phone\":\"01011112222\"}'::jsonb) from generate_series(1,50) i) x" >/dev/null
  q "insert into race_heats (event_id, number) select '$ev', n from generate_series(1,6) n" >/dev/null
  q "update race_registrations r set heat_id = (select id from race_heats h where h.event_id = r.event_id and h.number = case when substr(r.race_number,2)::int <= 45 then (substr(r.race_number,2)::int - 1) / 9 + 1 else 6 end) where r.event_id = '$ev'" >/dev/null
  q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_lock_heats('$ev')" >/dev/null
  echo "$ev"
}

# --- 9. 50 reception desks check in at the same instant, across 6 heats ----------------------------------------------------------------------
EVB50=$(setup_big_event concurrency-50)
[ "$(q "select count(*) from race_registrations where event_id='$EVB50'")" = "50" ] || fail "concurrency: the 50-athlete event was not created"
rm -f "$WORK"/c/b50*
barrier_hold 4
for i in $(seq 1 50); do checkin "b50_$i" "$(regid "$EVB50" "$i")" & done
wait; sleep 2
okc=$(cat "$WORK"/c/b50_*.out | grep -cE '^[0-9]+\|false\|' || true)
rows=$(q "select count(*) from race_check_ins where event_id='$EVB50'")
dup=$(q "select count(*) from (select registration_id from race_check_ins where event_id='$EVB50' group by 1 having count(*) > 1) x")
dist=$(q "select count(distinct checked_in_at) from race_check_ins where event_id='$EVB50'")
badpos=$(q "select count(*) from (select heat_id, count(*) n, count(distinct checked_in_at) d from race_check_ins where event_id='$EVB50' group by 1) x where n <> d")
[ "$okc" = "50" ] && [ "$rows" = "50" ] && [ "$dup" = "0" ] && [ "$dist" = "50" ] && [ "$badpos" = "0" ] || fail "concurrency: 50 simultaneous check-ins — ok=$okc rows=$rows duplicates=$dup distinct-times=$dist heats-with-ties=$badpos"
pass "concurrency: 50 simultaneous check-ins across 6 heats → 50 check-ins, no duplicate, 50 distinct server timestamps (nobody tied, nobody lost)"
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_start_event('$EVB50')" >/dev/null
[ "$(q "select count(*) from race_start_slots where event_id='$EVB50'")" = "50" ] || fail "concurrency: the schedule for 50 athletes has the wrong number of slots"
pass "concurrency: START EVENT on the full house froze 50 slots in 6 heats"

# --- 10. Everybody was disconnected for 40 minutes; twelve devices reconnect in the same instant -----------------------------------------------
rewind "$EVB50" 2400000
rm -f "$WORK"/c/rc*
barrier_hold 3
for n in $(seq 1 12); do call "rc$n" "select (race_control_state('$EVB50') -> 'clock' ->> 'race_ms')::bigint > 2399000" & done
wait; sleep 1
errs=$(cat "$WORK"/c/rc*.err | grep -c . || true)
starts=$(q "select count(*) from race_audit_log where action='race.athlete.start' and metadata->>'event_id'='$EVB50'")
perreg=$(q "select count(*) from (select registration_id from race_station_results where event_id='$EVB50' group by 1 having count(*) <> 9) x")
stuck=$(q "select count(*) from race_station_results where event_id='$EVB50' and ((status='ACTIVE' and window_end_race_ms <= race_now_ms('$EVB50')) or (status='SCHEDULED' and window_start_race_ms <= race_now_ms('$EVB50')) or (status='SCORING' and window_end_race_ms + 30000 <= race_now_ms('$EVB50')))")
dupslot=$(q "select count(*) from (select registration_id from race_start_slots where event_id='$EVB50' and status in ('BOUND','STARTED') group by 1 having count(*) > 1) x")
[ "$errs" = "0" ] && [ "$perreg" = "0" ] && [ "$stuck" = "0" ] && [ "$dupslot" = "0" ] && [ "$starts" -ge 1 ] || fail "concurrency: 12 simultaneous reconnects after a blackout — errors=$errs start-audits=$starts athletes-without-9-results=$perreg stale-statuses=$stuck double-slots=$dupslot"
distinct_starts=$(q "select count(*) from (select target_id from race_audit_log where action='race.athlete.start' and metadata->>'event_id'='$EVB50' group by 1 having count(*) > 1) x")
[ "$distinct_starts" = "0" ] || fail "concurrency: an athlete was started twice by simultaneous reconnects"
pass "concurrency: 40 minutes of blackout, 12 devices reconnect in the same instant → one settled state: $starts athletes started exactly once each, every station status matches race time, 0 errors, 0 double slots"

# --- 11. Closing a heat, simultaneously -----------------------------------------------------------------------------------------------------------
EVC6=$(setup_big_event concurrency-close)
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_start_event('$EVC6')" >/dev/null
rm -f "$WORK"/c/ch*
barrier_hold 3
for n in $(seq 1 8); do call "ch$n" "select athletes_dns from race_close_heat_without_start('$EVC6', 6, 'will not run $n')" & done
wait; sleep 1
succ=$(cat "$WORK"/c/ch?.out | grep -E '^[0-9]+$' | wc -l || true)
cancelled=$(q "select count(*) from race_heats where event_id='$EVC6' and number=6 and status='CANCELLED'")
audits=$(q "select count(*) from race_audit_log where action='race.heat.cancel' and metadata->>'event_id'='$EVC6'")
[ "$succ" = "1" ] && [ "$cancelled" = "1" ] && [ "$audits" = "1" ] || fail "concurrency: 8 simultaneous 'close heat' — successes=$succ cancelled=$cancelled audits=$audits"
pass "concurrency: 8 simultaneous CLOSE HEAT WITHOUT START → exactly 1 closes it, 1 audit row, the others are refused"

# ============================ Judge scoring: performance-event concurrency + idempotency (the REAL judge RPC) ============================
EVJ=$(setup_engine_event concurrency-judge 3)
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_start_event('$EVJ')" >/dev/null
rewind "$EVJ" 100000
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_advance('$EVJ')" >/dev/null
RES=$(q "select sr.id from race_station_results sr join race_stations st on st.id = sr.station_id join race_registrations r on r.id = sr.registration_id where sr.event_id='$EVJ' and st.number = 1 and r.race_number = 'N001'")
[ -n "$RES" ] || fail "judge concurrency: no station result for athlete 1 (the athlete did not start)"
rows() { q "select count(*) from race_performance_events where station_result_id='$RES'"; }
score() { q "select coalesce(official_score, 0) from race_station_results where id='$RES'"; }
act() { echo "select performance_event_id, duplicate from race_record_action('$RES', '$2', '$1'::uuid)"; }

# --- 12. One action delivered by 30 sessions at once (a retry storm on a single tap) ----------------------------------------------------------
CID=$(q "select gen_random_uuid()")
rm -f "$WORK"/c/jd*
barrier_hold 3
for n in $(seq 1 30); do call "jd$n" "$(act "$CID" REP)" & done
wait; sleep 1
errs=$(cat "$WORK"/c/jd*.err | grep -c . || true)
fresh=$(cat "$WORK"/c/jd*.out | grep -c '|f$' || true)
dups=$(cat "$WORK"/c/jd*.out | grep -c '|t$' || true)
[ "$errs" = "0" ] && [ "$fresh" = "1" ] && [ "$dups" = "29" ] && [ "$(rows)" = "1" ] && [ "$(score)" = "1" ] || fail "judge concurrency: one action from 30 sessions — errors=$errs fresh=$fresh duplicates=$dups rows=$(rows) score=$(score)"
pass "judge concurrency: ONE action delivered by 30 sessions at once → exactly 1 performance event, 29 answered as duplicates of the original, score 1, 0 errors"

# --- 13. Retry storm across many actions: 10 distinct actions, each sent 4 times simultaneously ----------------------------------------------------
IDS=(); for i in $(seq 1 10); do IDS+=("$(q "select gen_random_uuid()")"); done
rm -f "$WORK"/c/jr*
barrier_hold 3
for i in $(seq 0 9); do for rep in 1 2 3 4; do call "jr${i}_$rep" "$(act "${IDS[$i]}" REP)" & done; done
wait; sleep 1
errs=$(cat "$WORK"/c/jr*.err | grep -c . || true)
fresh=$(cat "$WORK"/c/jr*.out | grep -c '|f$' || true)
[ "$errs" = "0" ] && [ "$fresh" = "10" ] && [ "$(rows)" = "11" ] && [ "$(score)" = "11" ] || fail "judge concurrency: retry storm — errors=$errs fresh=$fresh rows=$(rows) score=$(score) (want 0/10/11/11)"
pass "judge concurrency: 10 actions × 4 simultaneous retries → exactly 10 new events (11 in total), 30 duplicates answered, score 11"

# --- 14. 20 judge devices, 5 distinct actions each, all at once --------------------------------------------------------------------------------------
rm -f "$WORK"/c/jm*
barrier_hold 3
for d in $(seq 1 20); do
  sqls=""; for k in 1 2 3 4 5; do sqls="$sqls select duplicate from race_record_action('$RES', 'REP', gen_random_uuid());"; done
  call "jm$d" "$sqls" &
done
wait; sleep 1
errs=$(cat "$WORK"/c/jm*.err | grep -c . || true)
[ "$errs" = "0" ] && [ "$(rows)" = "111" ] && [ "$(score)" = "111" ] || fail "judge concurrency: 20 devices × 5 — errors=$errs rows=$(rows) score=$(score) (want 0/111/111)"
pass "judge concurrency: 20 devices × 5 distinct actions in parallel → 100 more events, none lost, none doubled, score exactly 111, no deadlock"

# --- 15a. Voiding the same action from 8 sessions -------------------------------------------------------------------------------------------------------
rm -f "$WORK"/c/jw*
TARGET=$(q "select id from race_performance_events where station_result_id='$RES' and status='ACCEPTED' order by server_race_ms limit 1")
before=$(score)
barrier_hold 3
for n in $(seq 1 8); do call "jw$n" "select 1 from race_record_action('$RES','VOID',gen_random_uuid(),null,'ONLINE',null,null,null,null,'$TARGET')" & done
wait; sleep 1
voids=$(q "select count(*) from race_performance_events where voids_event_id='$TARGET' and status='ACCEPTED'")
[ "$voids" = "1" ] && [ "$(score)" = "$((before - 1))" ] || fail "judge concurrency: 8 simultaneous VOIDs of one action — accepted voids=$voids score=$(score) (was $before)"
pass "judge concurrency: 8 sessions voiding the same action → exactly 1 VOID accepted (the score drops by exactly 1)"

# --- 15. Actions racing the 3:00 lock: nothing is accepted at or after the window end ---------------------------------------------------------------
rewind "$EVJ" 235300   # the barrier holds ~2.3 s, so the burst starts ~1 s before the lock and runs ~1 s past it
base_rows=$(rows); base_acc=$(q "select count(*) from race_performance_events where station_result_id='$RES' and status='ACCEPTED'"); base_score=$(score)
rm -f "$WORK"/c/jl*
barrier_hold 3
for d in $(seq 1 40); do
  sqls=""; for k in 1 2 3 4 5 6 7 8; do sqls="$sqls select duplicate from race_record_action('$RES', 'REP', gen_random_uuid()); select pg_sleep(0.25);"; done
  call "jl$d" "$sqls" &
done
wait; sleep 1
errs=$(cat "$WORK"/c/jl*.err | grep -c . || true)
new_rows=$(( $(rows) - base_rows ))
acc=$(( $(q "select count(*) from race_performance_events where station_result_id='$RES' and status='ACCEPTED'") - base_acc ))
rej=$(q "select count(*) from race_performance_events where station_result_id='$RES' and status='REJECTED' and rejection_code='WINDOW_CLOSED'")
late=$(q "select count(*) from race_performance_events e join race_station_results sr on sr.id = e.station_result_id where e.station_result_id='$RES' and e.status='ACCEPTED' and e.server_race_ms >= sr.window_end_race_ms")
sc=$(score)
[ "$errs" = "0" ] && [ "$new_rows" = "320" ] && [ "$late" = "0" ] && [ "$acc" -gt 0 ] && [ "$rej" -gt 0 ] && [ "$((acc + rej))" = "320" ] && [ "$sc" = "$((base_score + acc))" ] || fail "judge concurrency: lock race — errors=$errs new-rows=$new_rows accepted=$acc rejected=$rej accepted-after-end=$late score=$sc (was $base_score)"
pass "judge concurrency: 320 actions from 40 devices racing the 3:00 lock → $acc accepted before it, $rej rejected WINDOW_CLOSED after it, 0 accepted at/after the end, none lost, score = previous + accepted ($sc)"

# --- 16. Master Control review races: one pending action, 8 reviewers ---------------------------------------------------------------------------------
PEND=$(q "select set_config('request.jwt.claim.sub','$FOUNDER',false)::text is not null; set role authenticated; select performance_event_id from race_record_action('$RES','REP',gen_random_uuid(),null,'OFFLINE_QUEUE',clock_timestamp() - interval '5 minutes',200000,1)" | tail -1)
[ "$(q "select status from race_performance_events where id='$PEND'")" = "PENDING_MASTER_REVIEW" ] || fail "judge concurrency: the offline replay was not held for review"
before=$(score)
rm -f "$WORK"/c/jv*
barrier_hold 3
for n in $(seq 1 8); do call "jv$n" "select (race_review_action('$PEND','APPROVED','ok $n') ->> 'score')" & done
wait; sleep 1
succ=$(cat "$WORK"/c/jv?.out | grep -E '^[0-9.]+$' | wc -l || true)
reviews=$(q "select count(*) from race_action_reviews where performance_event_id='$PEND'")
[ "$succ" = "1" ] && [ "$reviews" = "1" ] && [ "$(score)" = "$((before + 1))" ] || fail "judge concurrency: 8 simultaneous reviews — successes=$succ review-rows=$reviews score=$(score) (was $before)"
pass "judge concurrency: 8 Master Control reviews of one pending action at once → exactly 1 decision recorded, score +1 once"

# --- 18. A judge submits after a blackout: the RPC itself derives that the window is long closed ---------------------------------------------------------------
EVK2=$(setup_engine_event concurrency-judge-blackout 2)
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_start_event('$EVK2')" >/dev/null
rewind "$EVK2" 100000
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_advance('$EVK2')" >/dev/null
RES2=$(q "select sr.id from race_station_results sr join race_stations st on st.id = sr.station_id join race_registrations r on r.id = sr.registration_id where sr.event_id='$EVK2' and st.number = 1 and r.race_number = 'N001'")
rewind "$EVK2" 2400000     # 40 minutes pass; nobody ticks, nobody looks
rm -f "$WORK"/c/jb*
barrier_hold 3
for n in $(seq 1 12); do call "jb$n" "select status from race_record_action('$RES2','REP',gen_random_uuid())" & done
wait; sleep 1
acc=$(q "select count(*) from race_performance_events where station_result_id='$RES2' and status='ACCEPTED'")
rej=$(q "select count(*) from race_performance_events where station_result_id='$RES2' and rejection_code='WINDOW_CLOSED'")
st=$(q "select status from race_station_results where id='$RES2'")
[ "$acc" = "0" ] && [ "$rej" = "12" ] && [ "$st" = "LOCKED" ] || fail "judge concurrency: blackout — accepted=$acc rejected=$rej result=$st"
pass "judge concurrency: 40 minutes with no device ticking, then 12 judge submissions → all 12 REJECTED (WINDOW_CLOSED, kept in the ledger), result LOCKED — the RPC derived the state itself"
q "select race_sim.check_invariants('$EVJ', race_now_ms('$EVJ'))" >/dev/null && pass "judge concurrency: timing invariants hold after the scoring storms"

# ============================ Phase 9: rankings, publication, corrections under concurrency ============================
EVR=$(setup_engine_event concurrency-rankings 6)
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_start_event('$EVR')" >/dev/null
rewind "$EVR" 3000000
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_advance('$EVR')" >/dev/null
[ "$(q "select status from race_events where id='$EVR'")" = "FINISHED" ] || fail "rankings concurrency: setup — the event did not finish"
q "update race_station_results sr set official_score = 10 + (abs(hashtext(sr.registration_id::text || st.number)) % 4) * 5, technique_score = case when st.has_technique then 6 + (abs(hashtext(sr.registration_id::text || 't' || st.number)) % 3) * 0.5 end from race_stations st where st.id = sr.station_id and sr.event_id='$EVR' and sr.status = 'LOCKED'" >/dev/null
q "insert into race_ocr_records (event_id, station_id, station_result_id, storage_path, provider, proposed_distance_m, confidence, ocr_status, status, confirmed_distance_m, confirmed_by, captured_by, client_capture_id) select sr.event_id, sr.station_id, sr.id, sr.event_id::text || '/rowing/' || sr.id::text || '/fixture.jpg', 'fixture', coalesce(sr.official_score, 0)::int, 0.99, 'SUCCEEDED', 'CONFIRMED', coalesce(sr.official_score, 0)::int, '$FOUNDER', '$FOUNDER', gen_random_uuid() from race_station_results sr join race_stations st on st.id = sr.station_id where st.requires_ocr and sr.event_id='$EVR' and sr.status = 'LOCKED'" >/dev/null   # Phase 10: rowing needs confirmed evidence
CATR=$(q "select category_id from race_registrations where event_id='$EVR' limit 1")
ranked=$(q "select count(*) from race_registrations where event_id='$EVR' and race_status = 'FINISHED'")

# --- 19. Ten sessions compute the same provisional ranking at the same instant ---------------------------------------------------------------------
rm -f "$WORK"/c/rk*
barrier_hold 3
for n in $(seq 1 10); do call "rk$n" "select race_compute_rankings('$EVR', '$CATR')" & done
wait; sleep 1
errs=$(cat "$WORK"/c/rk*.err | grep -c . || true)
vers=$(q "select count(distinct version) from race_rankings where category_id='$CATR'")
rows=$(q "select count(*) from race_rankings where category_id='$CATR'")
[ "$errs" = "0" ] && [ "$vers" = "1" ] && [ "$rows" = "$ranked" ] || fail "rankings concurrency: 10 simultaneous computes — errors=$errs versions=$vers rows=$rows (want 1 version of $ranked rows)"
pass "rankings concurrency: 10 sessions compute the ranking at once → exactly 1 snapshot version ($rows rows), no errors, no duplicates"

# --- 20. Publish pressed by eight sessions at once ------------------------------------------------------------------------------------------------
rm -f "$WORK"/c/rp*
barrier_hold 3
for n in $(seq 1 8); do call "rp$n" "select race_publish_results('$EVR') ->> 'already'" & done
wait; sleep 1
fresh=$(cat "$WORK"/c/rp?.out | grep -c '^false$' || true); again=$(cat "$WORK"/c/rp?.out | grep -c '^true$' || true)
vers=$(q "select string_agg(distinct version::text, ',' order by version::text) from race_rankings where category_id='$CATR'")
off=$(q "select count(*) from race_audit_log where action = 'race.results.publish' and metadata ->> 'event_id' = '$EVR'")
[ "$fresh" = "1" ] && [ "$again" = "7" ] && [ "$vers" = "1,2" ] && [ "$off" = "1" ] && [ "$(q "select status from race_events where id='$EVR'")" = "RESULTS_OFFICIAL" ] || fail "rankings concurrency: 8 publishes — fresh=$fresh already=$again versions=$vers publish-audits=$off"
pass "rankings concurrency: 8 simultaneous PUBLISH → exactly 1 publication (7 'already'), official snapshot is version 2, 1 audit row"

# --- 21. Eight corrections of the same result at the same instant ------------------------------------------------------------------------------------------
RESC=$(q "select sr.id from race_station_results sr join race_stations st on st.id = sr.station_id where sr.event_id='$EVR' and st.number = 2 order by sr.registration_id limit 1")
rm -f "$WORK"/c/rc*
barrier_hold 3
for n in $(seq 1 8); do call "rc$n" "select race_correct_station_result('$RESC', 'official_score', $((60 + n)), 'storm $n') ->> 'status'" & done
wait; sleep 1
errs=$(cat "$WORK"/c/rc*.err | grep -c . || true)
ok=$(cat "$WORK"/c/rc?.out | grep -c '^CORRECTED$' || true)
led=$(q "select count(*) from race_result_corrections where station_result_id='$RESC'")
chain=$(q "select count(*) from (select old_value, lag(new_value) over (order by corrected_at, id) prev from race_result_corrections where station_result_id='$RESC') x where prev is not null and old_value is distinct from prev")
final=$(q "select official_score from race_station_results where id='$RESC'")
lastv=$(q "select (new_value #>> '{}')::numeric from race_result_corrections where station_result_id='$RESC' order by corrected_at desc, id desc limit 1")
latest=$(q "select max(version) from race_rankings where category_id='$CATR'")
stale=$(q "select count(*) from (select registration_id, station_placements, total_points, overall_rank from race_rankings where category_id='$CATR' and version=$latest except select registration_id, placements, total_points, overall_rank from race_rank_rows('$EVR','$CATR')) x")
[ "$errs" = "0" ] && [ "$ok" = "8" ] && [ "$led" = "8" ] && [ "$chain" = "0" ] && [ "$final" = "$lastv" ] && [ "$stale" = "0" ] && [ "$latest" -ge 2 ] && [ "$(q "select count(distinct version) from race_rankings where category_id='$CATR'")" = "$latest" ] && [ "$(q "select count(*) from race_rankings where category_id='$CATR' and version >= 2 and not is_official")" = "0" ] || fail "rankings concurrency: 8 corrections — errors=$errs ok=$ok ledger=$led broken-chain=$chain final=$final last=$lastv snapshot-vs-live-diff=$stale latest-version=$latest"
pass "rankings concurrency: 8 corrections of one result at once → 8 ledger rows in an unbroken old→new chain, final value = last ledger entry, snapshot versions 1..$latest are gap-free, every one after publication is official (versions are written only when the standing changes), and the latest equals the live ranking"

# --- 21b. The SAME correction (same value, same reason) sent by eight sessions: idempotent, never eight rows -------------------------------------------
RESI=$(q "select sr.id from race_station_results sr join race_stations st on st.id = sr.station_id where sr.event_id='$EVR' and st.number = 3 order by sr.registration_id limit 1")
before=$(q "select count(*) from race_result_corrections where station_result_id='$RESI'")
rm -f "$WORK"/c/ri*
barrier_hold 3
for n in $(seq 1 8); do call "ri$n" "select race_correct_station_result('$RESI', 'official_score', 77, 'same correction from desk $n') ->> 'status'" & done
wait; sleep 1
okc=$(cat "$WORK"/c/ri?.out | grep -c '^CORRECTED$' || true)
bad=0; for f in "$WORK"/c/ri*.err; do [ -s "$f" ] && ! grep -q 'RACE_NO_CHANGE' "$f" && bad=$((bad + 1)); done
led=$(q "select count(*) from race_result_corrections where station_result_id='$RESI'")
[ "$okc" = "1" ] && [ "$((led - before))" = "1" ] && [ "$bad" = "0" ] && [ "$(q "select official_score from race_station_results where id='$RESI'")" = "77" ] || fail "correction concurrency: 8 identical corrections — accepted=$okc new ledger rows=$((led - before)) unexpected errors=$bad (want 1 / 1 / 0)"
pass "correction concurrency: 8 IDENTICAL corrections at once → exactly 1 applied (1 ledger row), 7 refused as 'no change' — a repeated desk press cannot double-apply"

# ============================ Phase 10: rowing evidence under concurrency (the REAL RPCs) ============================
EVW=$(setup_engine_event concurrency-rowing 4)
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_start_event('$EVW')" >/dev/null
rewind "$EVW" 1925000          # N001's rowing work window (ends 1:32:00 race time = 1,920,000 ms) has just closed; its 0:30 transition is running
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_advance('$EVW')" >/dev/null
RESW=$(q "select sr.id from race_station_results sr join race_stations st on st.id = sr.station_id join race_registrations r on r.id = sr.registration_id where sr.event_id='$EVW' and st.number = 9 and r.race_number = 'N001'")
img() { q "insert into storage.objects (bucket_id, name, owner, metadata) values ('race-evidence', '$EVW/rowing/$RESW/$1', '$FOUNDER', '{\"size\": 120000}') on conflict do nothing" >/dev/null; }
SHA=$(printf 'a%.0s' $(seq 1 64))
capsql() { echo "select race_ocr_capture('$RESW', '$1', '$EVW/rowing/$RESW/$2', 'image/jpeg', 120000, '$SHA') ->> 'duplicate'"; }

# --- 22. The same photo registered by 20 sessions at once (a retried upload, a double tap, an outbox replay) -----------------------------------------
img same.jpg; CID=$(q "select gen_random_uuid()")
rm -f "$WORK"/c/oc*
barrier_hold 3
for n in $(seq 1 20); do call "oc$n" "$(capsql "$CID" same.jpg)" & done
wait; sleep 1
errs=$(cat "$WORK"/c/oc*.err | grep -c . || true)
fresh=$(cat "$WORK"/c/oc*.out | grep -c '^false$' || true); dups=$(cat "$WORK"/c/oc*.out | grep -c '^true$' || true)
rows=$(q "select count(*) from race_ocr_records where station_result_id='$RESW'")
[ "$errs" = "0" ] && [ "$fresh" = "1" ] && [ "$dups" = "19" ] && [ "$rows" = "1" ] || fail "rowing concurrency: 20 simultaneous registrations of one capture — errors=$errs fresh=$fresh duplicates=$dups attempts=$rows"
pass "rowing concurrency: ONE photo registered by 20 sessions at once → exactly 1 attempt (1 new, 19 duplicates), no errors — a retried upload never creates a second OCR attempt"
ATT=$(q "select id from race_ocr_records where station_result_id='$RESW'")

# --- 23. Eleven DIFFERENT photos registered at the same instant for the same result: only one attempt can be active -------------------------------
#         (first retake the current attempt so a new one is allowed)
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_ocr_retake('$ATT', gen_random_uuid(), 'concurrency test')" >/dev/null
rm -f "$WORK"/c/od*
for n in $(seq 1 11); do img "diff$n.jpg"; done
barrier_hold 3
for n in $(seq 1 11); do call "od$n" "$(capsql "$(q "select gen_random_uuid()")" "diff$n.jpg")" & done
wait; sleep 1
fresh=$(cat "$WORK"/c/od*.out | grep -c '^false$' || true)
active=$(cat "$WORK"/c/od*.err | grep 'ERROR' | grep -c 'RACE_OCR_ATTEMPT_ACTIVE' || true)
other=$(cat "$WORK"/c/od*.err | grep 'ERROR' | grep -vc 'RACE_OCR_ATTEMPT_ACTIVE' || true)
open=$(q "select count(*) from race_ocr_records where station_result_id='$RESW' and status in ('CAPTURED','PENDING_REVIEW','CONFIRMED')")
total=$(q "select count(*) from race_ocr_records where station_result_id='$RESW'")
[ "$fresh" = "1" ] && [ "$active" = "10" ] && [ "$other" = "0" ] && [ "$open" = "1" ] && [ "$total" = "2" ] || fail "rowing concurrency: 11 different captures at once — new=$fresh refused-active=$active other-errors=$other active-attempts=$open attempts=$total"
pass "rowing concurrency: 11 different photos at the same instant → exactly 1 new attempt, 10 refused 'confirm or retake first', still exactly one active attempt, the retaken one kept"
ATT=$(q "select id from race_ocr_records where station_result_id='$RESW' and status = 'CAPTURED'")
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_ocr_submit('$ATT', 'tesseract', 'tesseract.js@7', '842 m', '{}', 842, 0.97)" >/dev/null

# --- 24. Eight confirmations of the same attempt at once (4 different client ids, each sent twice) --------------------------------------------------
IDS=(); for n in 1 2 3 4; do IDS+=("$(q "select gen_random_uuid()")"); done
rm -f "$WORK"/c/ok*
barrier_hold 3
for n in 0 1 2 3 4 5 6 7; do call "ok$n" "select race_ocr_confirm('$ATT', '${IDS[$((n % 4))]}') ->> 'duplicate'" & done
wait; sleep 1
fresh=$(cat "$WORK"/c/ok?.out | grep -c '^false$' || true)
conf=$(q "select count(*) from race_ocr_records where station_result_id='$RESW' and status = 'CONFIRMED'")
bad=$(cat "$WORK"/c/ok?.err | grep 'ERROR' | grep -vc 'RACE_OCR_ALREADY_CONFIRMED' || true)
score=$(q "select official_score from race_station_results where id='$RESW'")
audits=$(q "select count(*) from race_audit_log where action = 'race.ocr.confirm' and target_id='$ATT'")
[ "$fresh" = "1" ] && [ "$conf" = "1" ] && [ "$bad" = "0" ] && [ "$score" = "842" ] && [ "$audits" = "1" ] || fail "rowing concurrency: 8 simultaneous confirmations — new=$fresh confirmed-rows=$conf unexpected-errors=$bad score=$score audit-rows=$audits"
pass "rowing concurrency: 8 simultaneous CONFIRMs of one photo → exactly 1 confirmation (score 842, 1 audit row); the rest are idempotent replays or the clean refusal 'already confirmed' — never a raw database error"

# --- 25. Eight Master Control corrections of the same result at once ---------------------------------------------------------------------------------
rewind "$EVW" 1960000          # the 0:30 transition is over; the result is LOCKED
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_advance('$EVW')" >/dev/null
rm -f "$WORK"/c/ow*
barrier_hold 3
for n in $(seq 1 8); do call "ow$n" "select race_correct_rowing_result('$RESW', $((900 + n)), 'storm $n') ->> 'status'" & done
wait; sleep 1
errs=$(cat "$WORK"/c/ow*.err | grep -c . || true)
ok=$(cat "$WORK"/c/ow?.out | grep -c '^CORRECTED$' || true)
led=$(q "select count(*) from race_result_corrections where station_result_id='$RESW' and field = 'rowing_distance_m'")
chain=$(q "select count(*) from (select old_value, lag(new_value) over (order by corrected_at, id) prev from race_result_corrections where station_result_id='$RESW' and field = 'rowing_distance_m') x where prev is not null and old_value is distinct from prev")
first=$(q "select old_value #>> '{}' from race_result_corrections where station_result_id='$RESW' and field = 'rowing_distance_m' order by corrected_at, id limit 1")
final=$(q "select official_score from race_station_results where id='$RESW'")
lastv=$(q "select new_value #>> '{}' from race_result_corrections where station_result_id='$RESW' and field = 'rowing_distance_m' order by corrected_at desc, id desc limit 1")
refs=$(q "select count(*) from race_result_corrections where station_result_id='$RESW' and field = 'rowing_distance_m' and evidence_ocr_id = '$ATT'")
orig=$(q "select proposed_distance_m || ':' || status || ':' || confirmed_distance_m from race_ocr_records where id='$ATT'")
[ "$errs" = "0" ] && [ "$ok" = "8" ] && [ "$led" = "8" ] && [ "$chain" = "0" ] && [ "$first" = "842" ] && [ "$final" = "$lastv" ] && [ "$refs" = "8" ] && [ "$orig" = "842:CONFIRMED:842" ] || fail "rowing concurrency: 8 corrections — errors=$errs ok=$ok ledger=$led broken-chain=$chain first-old=$first final=$final last=$lastv evidence-refs=$refs original=$orig"
pass "rowing concurrency: 8 simultaneous Master Control corrections → 8 ledger rows in an unbroken chain starting from the OCR-confirmed 842, every row cites the original evidence, final value = last entry ($final), the OCR record untouched"
# --- 26. Master Control review of a LATE confirmation, pressed by eight sessions at once ---------------------------------------------------------------
RES2=$(q "select sr.id from race_station_results sr join race_stations st on st.id = sr.station_id join race_registrations r on r.id = sr.registration_id where sr.event_id='$EVW' and st.number = 9 and r.race_number = 'N002'")
rewind "$EVW" 2140000          # N002's rowing window closed at 2,130,000; its 0:30 transition runs until 2,160,000: the photo is taken inside it
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_advance('$EVW')" >/dev/null
q "insert into storage.objects (bucket_id, name, owner, metadata) values ('race-evidence', '$EVW/rowing/$RES2/late.jpg', '$FOUNDER', '{\"size\": 120000}') on conflict do nothing" >/dev/null
ATT2=$(q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_ocr_capture('$RES2', gen_random_uuid(), '$EVW/rowing/$RES2/late.jpg', 'image/jpeg', 120000, '$SHA') ->> 'attempt_id'" | tail -1)
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_ocr_submit('$ATT2', 'tesseract', 'tesseract.js@7', '655 m', '{}', 655, 0.97)" >/dev/null
rewind "$EVW" 2170000          # ... and the judge only confirms after the transition: that needs Master Control
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_advance('$EVW')" >/dev/null
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_ocr_confirm('$ATT2', gen_random_uuid())" >/dev/null
[ "$(q "select status from race_ocr_records where id='$ATT2'")" = "PENDING_REVIEW" ] || fail "rowing concurrency: setup — the late confirmation is not PENDING_REVIEW"
rm -f "$WORK"/c/ov*
barrier_hold 3
for n in $(seq 1 8); do call "ov$n" "select race_ocr_review('$ATT2', 'APPROVED', 'review storm $n') ->> 'status'" & done
wait; sleep 1
fresh=$(cat "$WORK"/c/ov?.out | grep -c '^CONFIRMED$' || true)
bad=0; for f in "$WORK"/c/ov*.err; do [ -s "$f" ] && ! grep -q 'RACE_OCR_NOT_PENDING' "$f" && bad=$((bad + 1)); done
audits=$(q "select count(*) from race_audit_log where action = 'race.ocr.review' and metadata ->> 'result_id' = '$RES2'")
score=$(q "select official_score from race_station_results where id='$RES2'")
[ "$fresh" = "1" ] && [ "$bad" = "0" ] && [ "$audits" = "1" ] && [ "$score" = "655" ] || fail "rowing concurrency: 8 simultaneous Master reviews — decided=$fresh unexpected-errors=$bad audit-rows=$audits score=$score (want 1 / 0 / 1 / 655)"
pass "rowing concurrency: 8 simultaneous Master Control REVIEWS of one late confirmation → exactly 1 decision (score 655, 1 audit row), 7 told 'not pending' — a double tap cannot decide twice"
q "select race_sim.check_invariants('$EVW', race_now_ms('$EVW'))" >/dev/null && pass "rowing concurrency: timing invariants hold after the evidence storms"
