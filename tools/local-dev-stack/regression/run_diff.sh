#!/usr/bin/env bash
# LOCAL ONLY. Builds two throwaway databases — BASELINE (every repo migration before the
# Challenges set, i.e. what Reception/Sales run on today as far as the repo knows) and FULL
# (baseline + all Challenges migrations) — replays the identical Reception/Sales scenario as
# each role on both, and diffs the outputs. Any line that differs is printed.
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"; R="$(pwd)"; S="$R/.."; OUT="$R/.out"; mkdir -p "$OUT"
for kind in baseline full; do
  db="ninth_rs_$kind"
  if [ "$kind" = baseline ]; then STOP_BEFORE=20261105 SKIP_SEED=1 LOCAL_DB=$db bash "$S/apply.sh" > "$OUT/$kind.apply.log" 2>&1
  else SKIP_SEED=1 LOCAL_DB=$db bash "$S/apply.sh" > "$OUT/$kind.apply.log" 2>&1; fi
  tail -1 "$OUT/$kind.apply.log"
  su postgres -c "psql -v ON_ERROR_STOP=1 -q -d $db -f $R/00_seed.sql" > "$OUT/$kind.seed.log" 2>&1 || { echo "seed failed on $kind"; tail -5 "$OUT/$kind.seed.log"; exit 1; }
  su postgres -c "psql -q -d $db -f $R/10_scenario.sql" > "$OUT/$kind.out" 2>"$OUT/$kind.err"
  echo "$kind: $(grep -c ' | ' "$OUT/$kind.out") checks"
done
echo "=== DIFF baseline vs full (empty = identical) ==="
diff "$OUT/baseline.out" "$OUT/full.out" && echo "IDENTICAL"
