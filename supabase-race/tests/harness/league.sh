# Sourced by run.sh (needs: PSQL array, HERE, ROOT, WORK, apply(), step()). The PROPOSED league migration is applied ONLY here, to a separate throw-away
# database (race_league_test) of the throw-away cluster, after the real migrations. supabase/migrations is never modified; nothing here can reach a real project.
LDB=race_league_test
"${PSQL[@]}" -d postgres -c "create database $LDB" >/dev/null
lapply() { "${PSQL[@]}" -d "$LDB" -f "$1" >/dev/null; }
lapply "$HERE/supabase-shim.sql"
for f in "$ROOT"/supabase-race/supabase/migrations/*.sql; do lapply "$f"; done
PROPOSED="$ROOT/supabase-race/proposed/league"
for f in "$PROPOSED"/*.sql; do lapply "$f"; echo "  ok  proposed: $(basename "$f")"; done
"${PSQL[@]}" -d "$LDB" -f "$HERE/helpers.sql" >/dev/null
"${PSQL[@]}" -d "$LDB" -c "create table race_test.league_parity (doc jsonb not null); grant select on race_test.league_parity to public" >/dev/null
"${PSQL[@]}" -d "$LDB" -c "insert into race_test.league_parity values (\$json\$$(cat "$ROOT/packages/league/domain/parity-cases.json")\$json\$::jsonb)" >/dev/null
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
# the same isolation checks the main database passes, now with the league objects present (verify_deployment.sql pins exact object counts; its numbers change at activation)
"${PSQL[@]}" -d "$LDB" -f "$HERE/isolation.sql" 2>&1 | sed -n 's/^.*NOTICE:  //p'
