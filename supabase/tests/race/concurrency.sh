# Sourced by run.sh (needs: PSQL array, DB, WORK). Real parallel sessions —
# what SQL suites in one session cannot prove.
FOUNDER=aea7db27-3aaa-4701-aed2-f1b49127bdda
q() { "${PSQL[@]}" -d "$DB" -At -c "$1"; }
pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1"; exit 1; }

# --- Fixture events (as the founder / super admin) ---------------------------------
EV=$(q "select set_config('request.jwt.claim.sub','$FOUNDER',false)::text is not null; select race_create_event((select id from branches limit 1),'concurrency-free',date '2027-01-10')" | tail -1)
q "select set_config('request.jwt.claim.sub','$FOUNDER',false); select race_set_event_status('$EV','REGISTRATION_OPEN')" >/dev/null
EVP=$(q "select set_config('request.jwt.claim.sub','$FOUNDER',false)::text is not null; select race_create_event((select id from branches limit 1),'concurrency-paid',date '2027-01-10')" | tail -1)
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
already=$(grep -l 'RACE_ALREADY_PAID' "$WORK"/c/n*.err | wc -l)
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
  ev=$(q "select set_config('request.jwt.claim.sub','$FOUNDER',false)::text is not null; select race_create_event((select id from branches limit 1),'$slug',date '2027-02-01','THE NINTH','Africa/Cairo', timestamptz '2027-02-01 07:00:00+00')" | tail -1)
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
