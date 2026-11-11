#!/usr/bin/env bash
# LOCAL-ONLY concurrency + security harness for the device-verification
# hardening migration (20261116000001). Builds a throwaway database, applies
# the REAL table DDL and the REAL migration unmodified, and drives them with
# genuinely parallel psql sessions — separate OS processes, separate backends.
#
# Includes a NEGATIVE CONTROL: a deliberately naive read-then-write attempt
# counter (the shape of the original route handler) run through the same
# parallel driver. It must exceed the limit; if it does not, the harness is
# not capable of detecting the bug and every "bounded" result below is void.
#
# Never connects to Supabase or any remote database.
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"
HERE="$(pwd)"
MIG="$HERE/../../migrations"
DB="${SCRATCH_DB:-device_verification_harness}"
LOG="$HERE/.run-logs"
mkdir -p "${LOG:?}"
rm -f "${LOG:?}"/*
PASS=0; FAIL=0; FAILED=()
PARALLEL="${PARALLEL:-40}"

if [ -z "${PSQL_SUPERUSER+x}" ]; then
  if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then PSQL_SUPERUSER="su postgres -c"; else PSQL_SUPERUSER=""; fi
fi
pg() { # pg <db> <args...>  — runs psql with the given args as the superuser
  local db="$1"; shift
  if [ -n "$PSQL_SUPERUSER" ]; then
    local a="" x; for x in "$@"; do a="$a '${x//\'/\'\\\'\'}'"; done
    su postgres -c "psql -X -q -At -v ON_ERROR_STOP=0 -d $db $a" 2>&1
  else psql -X -q -At -v ON_ERROR_STOP=0 -d "$db" "$@" 2>&1; fi
}
q() { pg "$DB" -c "$1"; }
cleanup() { pg postgres -c "drop database if exists $DB" >/dev/null 2>&1; }
trap cleanup EXIT

ok()   { echo "  PASS: $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL: $1${2:+ — $2}"; FAIL=$((FAIL+1)); FAILED+=("$1"); }
eq()   { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "expected '$3', got '$2'"; fi; }
le()   { if [ "$2" -le "$3" ] 2>/dev/null; then ok "$1"; else bad "$1" "expected <= $3, got '$2'"; fi; }
gt()   { if [ "$2" -gt "$3" ] 2>/dev/null; then ok "$1"; else bad "$1" "expected > $3, got '$2'"; fi; }

H() { printf '%064d' "$1"; }                 # a deterministic 64-char hash stand-in
U() { printf '00000000-0000-0000-0000-%012d' "$1"; }

pg postgres -c "drop database if exists $DB" >/dev/null 2>&1
pg postgres -c "create database $DB" >/dev/null
pg "$DB" -v ON_ERROR_STOP=1 -f "$HERE/00_schema.sql" > "$LOG/00.log" 2>&1 || { echo "schema failed"; cat "$LOG/00.log"; exit 1; }

# the REAL table DDL, extracted — not copied
awk '/^create table device_verification_codes \(/,/^\);/' "$MIG/20260922000001_device_verification.sql" > "$LOG/table.sql"
echo "alter table device_verification_codes enable row level security;" >> "$LOG/table.sql"
grep -q "code_hash" "$LOG/table.sql" || { echo "could not extract the table DDL"; exit 1; }
pg "$DB" -v ON_ERROR_STOP=1 -f "$LOG/table.sql" > "$LOG/table.log" 2>&1 || { echo "table DDL failed"; cat "$LOG/table.log"; exit 1; }
pg "$DB" -v ON_ERROR_STOP=1 -f "$MIG/20261116000001_device_verification_hardening.sql" > "$LOG/mig.log" 2>&1 || { echo "MIGRATION FAILED"; cat "$LOG/mig.log"; exit 1; }
grep -qi "ERROR" "$LOG/mig.log" && { echo "migration logged errors"; cat "$LOG/mig.log"; exit 1; }
echo "=== schema + real table DDL + real migration applied ==="
for i in $(seq 1 20); do q "insert into profiles values ('$(U $i)')" >/dev/null; done
# Every test below runs the functions AS service_role, the only role allowed to.
SR() { printf 'set role service_role; %s' "$1"; }
last() { tail -1; }

# ----------------------------------------------------------------------------
echo; echo "=== (1) privileges: service_role only ==="
for f in "device_verification_limits()" "device_verification_lock(uuid)" "device_verification_recent_failures(uuid)" \
         "issue_device_verification_code(uuid,uuid,text)" "begin_device_code_attempt(uuid)" "complete_device_code_attempt(uuid,uuid,boolean)"; do
  for r in public anon authenticated; do
    eq "$r cannot execute $f" "$(q "select has_function_privilege('$r', 'public.$f', 'execute')")" "f"
  done
  eq "service_role CAN execute $f" "$(q "select has_function_privilege('service_role', 'public.$f', 'execute')")" "t"
done
eq "the code table still has RLS on and no policy" "$(q "select relrowsecurity::text || ':' || (select count(*) from pg_policies where tablename='device_verification_codes') from pg_class where relname='device_verification_codes'")" "true:0"

# ----------------------------------------------------------------------------
echo; echo "=== (2) NEGATIVE CONTROL: a naive read-then-write counter over-counts under $PARALLEL parallel sessions ==="
q "create table naive_codes (id int primary key, attempts int not null default 0, max_attempts int not null default 5);
   insert into naive_codes values (1, 0, 5);
   create table naive_evals (n serial primary key);
   create function naive_attempt() returns text language plpgsql as \$f\$
   declare v naive_codes%rowtype; begin
     select * into v from naive_codes where id = 1;          -- READ
     if v.attempts >= v.max_attempts then return 'locked'; end if;
     perform pg_sleep(0.05);                                  -- the window the real route has: a network round trip
     update naive_codes set attempts = v.attempts + 1 where id = 1;   -- WRITE
     insert into naive_evals default values;                  -- one guess evaluated
     return 'ok'; end \$f\$;" >/dev/null
for i in $(seq 1 $PARALLEL); do ( q "select naive_attempt()" > "$LOG/naive_$i.out" ) & done; wait
NAIVE=$(q "select count(*) from naive_evals")
gt "the naive counter evaluated MORE than 5 guesses ($NAIVE of $PARALLEL), so the harness does detect the race" "$NAIVE" 5

# ----------------------------------------------------------------------------
echo; echo "=== (3) $PARALLEL parallel wrong guesses against ONE code (max_attempts = 5), three independent rounds ==="
for round in 1 2 3; do
  u=$round
  q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H $u)')")" >/dev/null
  rm -f "${LOG:?}"/par_*.out
  for i in $(seq 1 $PARALLEL); do ( q "$(SR "select status || '|' || coalesce(code_hash,'NULL') from begin_device_code_attempt('$(U $u)')")" > "$LOG/par_$i.out" ) & done; wait
  OKN=$(cat "$LOG"/par_*.out | grep -c '^ok|')
  eq "round $round: exactly 5 attempts were GRANTED out of $PARALLEL" "$OKN" "5"
  eq "round $round: the stored hash was handed out ONLY with a granted attempt" "$(cat "$LOG"/par_*.out | grep -v '^ok|' | grep -vc '|NULL$')" "0"
  eq "round $round: the attempts column recorded exactly 5" "$(q "select attempts from device_verification_codes where user_id='$(U $u)'")" "5"
  # begin only GRANTS attempts; nothing has completed yet, so the code is not consumed by begin
  eq "round $round: refusing past the limit does not consume the code (granted attempts may still be in flight)" "$(q "select (consumed_at is null)::text from device_verification_codes where user_id='$(U $u)'")" "true"
done

# ----------------------------------------------------------------------------
echo; echo "=== (4) parallel CORRECT submissions: the code verifies exactly once (replay-safe) ==="
u=4
q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H $u)')")" >/dev/null
cat > "$LOG/correct.sql" <<EOF
set role service_role;
select status, code_id from begin_device_code_attempt('$(U $u)') \gset
select case when :'status' = 'ok' then complete_device_code_attempt('$(U $u)', :'code_id'::uuid, true) else :'status' end;
EOF
for i in $(seq 1 $PARALLEL); do ( pg "$DB" -f "$LOG/correct.sql" > "$LOG/cor_$i.out" ) & done; wait
eq "exactly ONE of $PARALLEL simultaneous correct submissions verified" "$(cat "$LOG"/cor_*.out | grep -c '^verified$')" "1"
eq "…the code is consumed and marked succeeded" "$(q "select (consumed_at is not null)::text || ':' || succeeded::text from device_verification_codes where user_id='$(U $u)'")" "true:true"
eq "…and a later replay of the same code finds nothing to attempt" "$(q "$(SR "select status from begin_device_code_attempt('$(U $u)')")" | last)" "not_found"

# ----------------------------------------------------------------------------
echo; echo "=== (4b) DETERMINISTIC interleaving: a correct attempt granted BEFORE the limit was reached can still complete AFTER it ==="
# The parallel test above passes or fails on timing. This one forces the
# interleaving that exposed a real flaw: five attempts granted, a sixth refused,
# and only then does the first request record its (correct) outcome.
u=16
q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H $u)')")" >/dev/null
CID=$(q "select id from device_verification_codes where user_id='$(U $u)'")
G=""; for i in 1 2 3 4 5; do G="$G $(q "$(SR "select status from begin_device_code_attempt('$(U $u)')")" | last)"; done
eq "five attempts are granted" "$(echo $G)" "ok ok ok ok ok"
eq "the sixth is refused" "$(q "$(SR "select status || '|' || coalesce(code_hash,'NULL') from begin_device_code_attempt('$(U $u)')")" | last)" "locked|NULL"
eq "refusing the sixth did NOT consume the code" "$(q "select (consumed_at is null)::text from device_verification_codes where id='$CID'")" "true"
eq "the first granted attempt, correct, still verifies" "$(q "$(SR "select complete_device_code_attempt('$(U $u)', '$CID', true)")" | last)" "verified"
eq "a second granted attempt, also correct, is a replay" "$(q "$(SR "select complete_device_code_attempt('$(U $u)', '$CID', true)")" | last)" "replayed"

u=17  # the same interleaving with every outcome WRONG: the last failure consumes the code
q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H $u)')")" >/dev/null
CID=$(q "select id from device_verification_codes where user_id='$(U $u)'")
for i in 1 2 3 4 5; do q "$(SR "select status from begin_device_code_attempt('$(U $u)')")" >/dev/null; done
q "$(SR "select status from begin_device_code_attempt('$(U $u)')")" >/dev/null   # refused
R=""; for i in 1 2 3 4 5; do R="$R $(q "$(SR "select complete_device_code_attempt('$(U $u)', '$CID', false)")" | last)"; done
eq "five wrong outcomes recorded after the limit: invalid x4 then locked" "$(echo $R)" "invalid invalid invalid invalid locked"
eq "…and the code is then consumed" "$(q "select (consumed_at is not null)::text from device_verification_codes where id='$CID'")" "true"

# ----------------------------------------------------------------------------
echo; echo "=== (5) success, replay, expiry ==="
u=5
q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H $u)')")" >/dev/null
CID=$(q "select id from device_verification_codes where user_id='$(U $u)'")
eq "a correct code verifies" "$(q "$(SR "select complete_device_code_attempt('$(U $u)', '$CID', true)")" | last)" "verified"
eq "the same code CANNOT verify twice (replay)" "$(q "$(SR "select complete_device_code_attempt('$(U $u)', '$CID', true)")" | last)" "replayed"

u=6   # expired before the first attempt
q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H $u)')")" >/dev/null
q "update device_verification_codes set expires_at = now() - interval '1 second' where user_id='$(U $u)'" >/dev/null
eq "an expired code is not attempted" "$(q "$(SR "select status || '|' || coalesce(code_hash,'NULL') from begin_device_code_attempt('$(U $u)')")" | last)" "expired|NULL"
eq "…and is consumed" "$(q "select (consumed_at is not null)::text from device_verification_codes where user_id='$(U $u)'")" "true"

u=7   # granted an attempt, then the code expires BEFORE the outcome is recorded
q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H $u)')")" >/dev/null
CID=$(q "select id from device_verification_codes where user_id='$(U $u)'")
q "$(SR "select status from begin_device_code_attempt('$(U $u)')")" >/dev/null
q "update device_verification_codes set expires_at = now() - interval '1 second' where user_id='$(U $u)'" >/dev/null
eq "a code that expires mid-attempt cannot verify" "$(q "$(SR "select complete_device_code_attempt('$(U $u)', '$CID', true)")" | last)" "replayed"

u=8   # a code belonging to ANOTHER user can never be completed
q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H $u)')")" >/dev/null
CID=$(q "select id from device_verification_codes where user_id='$(U $u)'")
eq "a code cannot be verified on behalf of a different user" "$(q "$(SR "select complete_device_code_attempt('$(U 9)', '$CID', true)")" | last)" "replayed"
eq "…and it is still unconsumed for its owner" "$(q "select (consumed_at is null)::text from device_verification_codes where id='$CID'")" "true"

u=10  # wrong guesses: invalid x4, then the 5th spends the code
q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H $u)')")" >/dev/null
CID=$(q "select id from device_verification_codes where user_id='$(U $u)'")
R=""; for i in 1 2 3 4 5; do
  q "$(SR "select status from begin_device_code_attempt('$(U $u)')")" >/dev/null
  R="$R $(q "$(SR "select complete_device_code_attempt('$(U $u)', '$CID', false)")" | last)"
done
eq "wrong guesses: invalid x4, the fifth locks the code" "$(echo $R)" "invalid invalid invalid invalid locked"
eq "…a locked code cannot be tried again" "$(q "$(SR "select status from begin_device_code_attempt('$(U $u)')")" | last)" "not_found"

# ----------------------------------------------------------------------------
echo; echo "=== (6) issuance limits ==="
u=11
eq "the first code is issued" "$(q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H 11)')")" | last)" "issued"
eq "a second request inside the cooldown is refused" "$(q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H 12)')")" | last)" "cooldown"
q "update device_verification_codes set created_at = created_at - interval '2 minutes' where user_id='$(U $u)'" >/dev/null
eq "after the cooldown a new code is issued" "$(q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H 13)')")" | last)" "issued"
eq "…and it SUPERSEDES the earlier code (only one live code)" "$(q "select count(*) from device_verification_codes where user_id='$(U $u)' and consumed_at is null")" "1"
q "update device_verification_codes set created_at = created_at - interval '2 minutes' where user_id='$(U $u)'" >/dev/null
eq "the third code in an hour is issued" "$(q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H 14)')")" | last)" "issued"
q "update device_verification_codes set created_at = created_at - interval '2 minutes' where user_id='$(U $u)'" >/dev/null
eq "the FOURTH code in an hour is refused (hourly cap 3)" "$(q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H 15)')")" | last)" "hourly_limit"

u=12
q "insert into device_verification_codes (user_id, code_hash, expires_at, consumed_at, created_at)
   select '$(U $u)', '$(H 99)', now(), now(), now() - (n || ' hours')::interval from generate_series(2, 11) n" >/dev/null
eq "ten codes in a day is the cap: the eleventh is refused" "$(q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H 16)')")" | last)" "daily_limit"

u=13   # cumulative failures across codes lock the account out of fresh codes AND of attempts
q "insert into device_verification_codes (user_id, code_hash, expires_at, consumed_at, attempts, created_at)
   select '$(U $u)', '$(H 98)', now(), now(), 5, now() - (n || ' minutes')::interval from generate_series(10, 12) n" >/dev/null
eq "15 failed guesses across codes in an hour: no new code may be issued" "$(q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H 17)')")" | last)" "locked"
eq "…and no attempt is granted either" "$(q "$(SR "select status || '|' || coalesce(code_hash,'NULL') from begin_device_code_attempt('$(U $u)')")" | last)" "locked|NULL"
q "update device_verification_codes set created_at = now() - interval '61 minutes' where user_id='$(U $u)'" >/dev/null
eq "the lockout ages out: failures older than an hour no longer count" "$(q "$(SR "select issue_device_verification_code('$(U $u)', gen_random_uuid(), '$(H 18)')")" | last)" "issued"

u=14   # a SUCCESSFUL attempt is not a failure
q "insert into device_verification_codes (user_id, code_hash, expires_at, consumed_at, attempts, succeeded, created_at)
   values ('$(U $u)', '$(H 97)', now(), now(), 1, true, now() - interval '5 minutes')" >/dev/null
eq "a successful attempt does not count against the failure budget" "$(q "$(SR "select device_verification_recent_failures('$(U $u)')")" | last)" "0"

# ----------------------------------------------------------------------------
echo; echo "=== (7) argument safety ==="
eq "a malformed hash is refused outright" "$(q "$(SR "select issue_device_verification_code('$(U 15)', gen_random_uuid(), 'short')")" | grep -c 'invalid device verification code arguments')" "1"
eq "a NULL user is refused" "$(q "$(SR "select begin_device_code_attempt(null)")" | grep -c 'invalid device verification attempt arguments')" "1"

echo
echo "=============================================="
echo "RESULT: $PASS passed, $FAIL failed"
echo "=============================================="
if [ "$FAIL" -gt 0 ]; then for f in "${FAILED[@]}"; do echo "  - $f"; done; exit 1; fi
exit 0
