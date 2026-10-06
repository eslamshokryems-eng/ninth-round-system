# Sourced by run.sh (needs: PSQL array, DB, WORK, ROOT, q(), pass(), fail()). DRY RUN of the staging seed scripts (supabase-race/seed/staging) against the
# THROW-AWAY test database with fake accounts — never against a real project. Proves: preflight rejects bad input, the four scripts work through the real
# RPCs/RLS as a Super Admin, the second run changes NOTHING (idempotent), and verification catches drift.
declare -F q >/dev/null || {
  q() { "${PSQL[@]}" -d "$DB" -At -c "$1"; }
  pass() { echo "PASS  $1"; }
  fail() { echo "FAIL  $1"; exit 1; }
}
SD="$ROOT/supabase-race/seed/staging"
mkdir -p "$WORK/seed"
export ROSTER_CSV="$WORK/seed/roster.csv"
# fake accounts: the Super Admin + the roster (Auth users first — the real procedure — then promote through the REAL bootstrap script)
q "insert into auth.users (email, raw_user_meta_data) select e || '@seed.invalid', jsonb_build_object('full_name', e) from unnest(array['owner','manager','master','rec1','rec2','j1','j2','j3','j4','j5','j6','j7','j8','j9','scr1','scr9']) e" >/dev/null
"${PSQL[@]}" -d "$DB" -q -v email="'owner@seed.invalid'" -f "$ROOT/supabase-race/bootstrap/promote_super_admin.sql" | grep -q "is now a THE NINTH Super Admin" || fail "seed dry-run: bootstrap/promote_super_admin.sql did not promote the fake owner"
{ echo "# role,email,station"; echo "role,email,station"
  echo "EVENT_MANAGER,manager@seed.invalid,"; echo "MASTER_CONTROL,master@seed.invalid,"; echo "RECEPTION,rec1@seed.invalid,"; echo "RECEPTION,REC2@seed.invalid,"
  for i in 1 2 3 4 5 6 7 8 9; do echo "JUDGE,j$i@seed.invalid,$i"; done
  echo "STATION_SCREEN,scr1@seed.invalid,1"; echo "STATION_SCREEN,scr9@seed.invalid,9"; } > "$ROSTER_CSV"
chmod 644 "$ROSTER_CSV"
VARS=(-v ON_ERROR_STOP=1 -v actor_email=owner@seed.invalid -v event_slug=seed-dryrun-staging -v event_date=2026-12-18 -v "event_name=THE NINTH (dry run)" -v "event_venue=9th Round Arena"
      -v event_fee=750 -v "event_planned_start=2026-12-18 07:00:00+00" -v event_timezone=Africa/Cairo -v target_env=staging)
run_seed() { local f="$1"; shift; "${PSQL[@]}" -d "$DB" "${VARS[@]}" "$@" -f "$SD/$f" 2>&1; }
state() { q "select (select count(*) from race_events where slug like 'seed-%') || ':' || (select count(*) from race_staff s join race_events e on e.id = s.event_id where e.slug = 'seed-dryrun-staging') || ':' || (select count(*) from race_audit_log a join race_events e on e.id::text = a.metadata ->> 'event_id' where e.slug = 'seed-dryrun-staging') || ':' || (select registration_fee::text from race_events where slug = 'seed-dryrun-staging')"; }

# preflight refuses bad input -----------------------------------------------------------------------------------------------------------------------
out=$(run_seed 00_preflight.sql -v event_slug=seed-dryrun-production) && fail "seed dry-run: preflight accepted a slug that does not end in -staging/-dryrun"
echo "$out" | grep -q "must end in -staging or -dryrun" || fail "seed dry-run: wrong refusal for a production-looking slug: $out"
out=$(run_seed 00_preflight.sql -v target_env=production) && fail "seed dry-run: preflight accepted target_env=production"
out=$(run_seed 00_preflight.sql -v actor_email=manager@seed.invalid) && fail "seed dry-run: preflight accepted a non-Super-Admin actor"
echo "$out" | grep -q "not an active Super Admin" || fail "seed dry-run: wrong refusal for a non-admin actor: $out"
cp "$ROSTER_CSV" "$WORK/seed/good.csv"; echo "JUDGE,nobody@seed.invalid,3" >> "$ROSTER_CSV"
out=$(run_seed 00_preflight.sql) && fail "seed dry-run: preflight accepted a roster email without an account"
echo "$out" | grep -q "has no Auth user" || fail "seed dry-run: wrong refusal for an unknown email: $out"
cp "$WORK/seed/good.csv" "$ROSTER_CSV"; echo "JUDGE,j1@seed.invalid," >> "$ROSTER_CSV"
out=$(run_seed 00_preflight.sql) && fail "seed dry-run: preflight accepted a judge without a station"
cp "$WORK/seed/good.csv" "$ROSTER_CSV"; echo "RECEPTION,rec1@seed.invalid,4" >> "$ROSTER_CSV"
out=$(run_seed 00_preflight.sql) && fail "seed dry-run: preflight accepted a reception line with a station"
cp "$WORK/seed/good.csv" "$ROSTER_CSV"
[ "$(q "select count(*) from race_events where slug like 'seed-%'")" = "0" ] || fail "seed dry-run: preflight changed something"
pass "seed dry-run: preflight is read-only and refuses a production-looking slug, target_env=production, a non-Super-Admin actor, an unknown email, a judge without a station, a station on a desk role"
out=$(run_seed 00_preflight.sql) || fail "seed dry-run: preflight failed on a good roster: $out"
echo "$out" | grep -q "PREFLIGHT OK" || fail "seed dry-run: no PREFLIGHT OK: $out"

# first run ------------------------------------------------------------------------------------------------------------------------------------------------
out=$(run_seed 01_event.sql) || fail "seed dry-run: 01_event failed: $out"; echo "$out" | grep -q "created" || fail "seed dry-run: 01 did not create the event: $out"
out=$(run_seed 02_staff.sql) || fail "seed dry-run: 02_staff failed: $out"; echo "$out" | grep -q "15 granted" || fail "seed dry-run: expected 15 grants: $out"
out=$(run_seed 03_verify_seed.sql) || fail "seed dry-run: 03_verify failed: $out"; echo "$out" | grep -q "VERIFY OK" || fail "seed dry-run: no VERIFY OK: $out"
S1=$(state)
[ "$(q "select status::text || ':' || registration_fee::text || ':' || venue from race_events where slug = 'seed-dryrun-staging'")" = "REGISTRATION_OPEN:750.00:9th Round Arena" ] || fail "seed dry-run: event is not open with the fee and venue"
[ "$(q "select count(*) from race_staff s join race_events e on e.id = s.event_id where e.slug = 'seed-dryrun-staging' and s.active and s.role = 'JUDGE'")" = "9" ] || fail "seed dry-run: not 9 judges"
[ "$(q "select count(distinct station_id) from race_staff s join race_events e on e.id = s.event_id where e.slug = 'seed-dryrun-staging' and s.role = 'JUDGE'")" = "9" ] || fail "seed dry-run: judges do not cover 9 stations"
[ "$(q "select count(*) from race_audit_log where action = 'race.staff.insert' and metadata ->> 'event_id' = (select id::text from race_events where slug = 'seed-dryrun-staging')")" -ge 15 ] || fail "seed dry-run: grants were not audited"
pass "seed dry-run: first run — event created through the real RPC, registration opened, fee/venue set, 15 grants through real RLS (all audited), verification OK (9 judges, 9 stations)"

# second run: NOTHING changes ---------------------------------------------------------------------------------------------------------------------------
out=$(run_seed 01_event.sql) || fail "seed dry-run: 01 re-run failed: $out"; echo "$out" | grep -q "already exists" || fail "seed dry-run: 01 re-run did not say 'already exists': $out"
out=$(run_seed 02_staff.sql) || fail "seed dry-run: 02 re-run failed: $out"; echo "$out" | grep -q "0 granted, 0 re-activated, 15 already in place" || fail "seed dry-run: 02 re-run was not a no-op: $out"
out=$(run_seed 03_verify_seed.sql) || fail "seed dry-run: verify after the re-run: $out"; echo "$out" | grep -q "VERIFY OK" || fail "seed dry-run: verify after the re-run (no VERIFY OK): $out"
S2=$(state); [ "$S1" = "$S2" ] || fail "seed dry-run: re-running changed state ($S1 → $S2)"
pass "seed dry-run: second run is a no-op — 0 new events, 0 new staff rows, 0 new audit rows, same fee ($S2)"

# drift handling -------------------------------------------------------------------------------------------------------------------------------------------
q "update race_staff set active = false where role = 'RECEPTION' and event_id = (select id from race_events where slug = 'seed-dryrun-staging') and profile_id = (select id from race_profiles where email = 'rec1@seed.invalid')" >/dev/null
out=$(run_seed 03_verify_seed.sql) && fail "seed dry-run: verification did not notice a deactivated roster member"
out=$(run_seed 02_staff.sql) || fail "seed dry-run: 02 failed to re-activate: $out"; echo "$out" | grep -q "1 re-activated" || fail "seed dry-run: 02 did not re-activate: $out"
out=$(run_seed 03_verify_seed.sql) || fail "seed dry-run: verification after re-activation: $out"; echo "$out" | grep -q "VERIFY OK" || fail "seed dry-run: verification after re-activation (no VERIFY OK): $out"
q "insert into race_staff (event_id, profile_id, role) select e.id, p.id, 'RECEPTION' from race_events e, race_profiles p where e.slug = 'seed-dryrun-staging' and p.email = 'j9@seed.invalid'" >/dev/null
out=$(run_seed 03_verify_seed.sql) && fail "seed dry-run: verification did not notice an extra staff member"
echo "$out" | grep -q "NOT in the roster" || fail "seed dry-run: wrong message for an extra staff member: $out"
q "delete from race_staff where role = 'RECEPTION' and profile_id = (select id from race_profiles where email = 'j9@seed.invalid')" >/dev/null 2>&1 || q "update race_staff set active = false where role = 'RECEPTION' and profile_id = (select id from race_profiles where email = 'j9@seed.invalid')" >/dev/null
out=$(run_seed 03_verify_seed.sql) || fail "seed dry-run: verification after removing the extra grant: $out"; echo "$out" | grep -q "VERIFY OK" || fail "seed dry-run: verification after removing the extra grant (no VERIFY OK): $out"
pass "seed dry-run: drift is caught (a deactivated member and an extra grant fail verification), a deactivated grant is re-activated, nothing is ever deleted by the scripts"
