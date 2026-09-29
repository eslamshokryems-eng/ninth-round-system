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
