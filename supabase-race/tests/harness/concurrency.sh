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
