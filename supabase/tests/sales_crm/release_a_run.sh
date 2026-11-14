#!/usr/bin/env bash
# LOCAL ONLY. Release A: behaviour parity (before/after), rollback, catalog, benchmarks. Never touches any remote database.
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"; HERE="$(pwd)"; ROOT="$HERE/../../.."
DB="${SCRATCH_DB:-ninth_sales_a}"; LOG="$HERE/.run-logs"; mkdir -p "$LOG"; OUT="${OUT_DIR:-$LOG}"
SU="su postgres -c"; [ "$(id -u)" = "0" ] || SU="bash -c"
PW="$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
cleanup() { $SU "psql -q -d postgres -c 'drop database if exists $DB' -c 'drop role if exists sca_authn'" >/dev/null 2>&1; [ "${KEEP_LOGS:-0}" = "1" ] || rm -rf "$LOG"; }
[ "${KEEP_DB:-0}" = "1" ] || trap cleanup EXIT
MIG="$ROOT/supabase/migrations/20261123000001_sales_rls_performance.sql"; RBK="$ROOT/supabase/rollback/sales_rls_performance_rollback.sql"
# Production-like schema WITHOUT the refund/financial migrations (they must not be needed by this release)
LOCAL_DB="$DB" SKIP_SEED=1 STOP_BEFORE=20261118000001 bash "$ROOT/tools/local-dev-stack/apply.sh" > "$LOG/apply.log" 2>&1 || { echo "build failed"; tail -5 "$LOG/apply.log"; exit 1; }
$SU "psql -v ON_ERROR_STOP=1 -q -d $DB -f $ROOT/tools/local-dev-stack/regression/00_seed.sql" > "$LOG/seed.log" 2>&1 || { echo "seed failed"; exit 1; }
$SU "psql -v ON_ERROR_STOP=1 -q -d $DB -f $HERE/release_a_setup.sql" > "$LOG/setup.log" 2>&1 || { echo "setup failed"; tail -5 "$LOG/setup.log"; exit 1; }
$SU "psql -q -d postgres" >/dev/null 2>&1 <<SQL
drop role if exists sca_authn; create role sca_authn login noinherit password '$PW'; grant anon, authenticated, service_role to sca_authn;
SQL
AUTHN() { PGPASSWORD="$PW" psql -h 127.0.0.1 -U sca_authn -d "$DB" "$@"; }
runtests() { $SU "psql -q -d $DB -c 'truncate scr.res restart identity'" >/dev/null 2>&1; AUTHN -q -f "$HERE/release_a_tests.sql" 2>"$LOG/$1.err" | sed -n '/===== RESULTS/,$p' > "$OUT/release_a_$1.txt"; }
runtests before
$SU "psql -v ON_ERROR_STOP=1 -1 -q -d $DB -f $MIG" > "$LOG/mig.log" 2>&1; MX=$?
[ -n "${MUTATE_SQL:-}" ] && $SU "psql -q -d $DB -c \"$MUTATE_SQL\"" >/dev/null 2>&1   # test-the-tests hook (local only)
runtests after
$SU "psql -v ON_ERROR_STOP=1 -1 -q -d $DB -f $RBK" > "$LOG/rbk.log" 2>&1; RX=$?
runtests rolledback
$SU "psql -v ON_ERROR_STOP=1 -1 -q -d $DB -f $MIG" > "$LOG/mig2.log" 2>&1; MX2=$?
runtests reapplied
echo "migration exit=$MX rollback exit=$RX re-apply exit=$MX2"
for k in before after rolledback reapplied; do echo "== $k: $(grep SUMMARY "$OUT/release_a_$k.txt")"; done
# behaviour parity: identical except catalog rows (CAT)
strip() { grep -v "exp: CAT" "$1" | grep -E "^[A-Z]+[0-9a-z]* +(PASS|FAIL)" ; }
diff <(strip "$OUT/release_a_before.txt") <(strip "$OUT/release_a_after.txt") > "$OUT/parity_diff.txt" && echo "PARITY before/after: IDENTICAL ($(strip "$OUT/release_a_before.txt" | wc -l) behaviour checks)" || { echo "PARITY DIFF:"; cat "$OUT/parity_diff.txt"; }
diff <(strip "$OUT/release_a_before.txt") <(strip "$OUT/release_a_rolledback.txt") >/dev/null && echo "ROLLBACK restores identical behaviour" || echo "ROLLBACK behaviour DIFF"
grep -E "^(CAT1|G01)" "$OUT/release_a_before.txt" "$OUT/release_a_after.txt" | sed 's/ *| */ | /g' | cut -c1-260
grep -E " FAIL " "$OUT/release_a_after.txt" | cut -c1-260
[ "${SKIP_BENCH:-0}" = "1" ] && exit 0
# ---------------- benchmarks ----------------
bench() { # label
  AUTHN -q -f /dev/null; PGPASSWORD="$PW" pgbench -n -h 127.0.0.1 -U sca_authn -d "$DB" -f "$HERE/bench_dashboard.pgb" -c "$2" -j 4 -T "$3" 2>&1 | grep -E "latency average|tps =|number of failed|number of transactions actually" | tr '\n' ' '; echo; }
grow() { $SU "psql -q -d $DB" >/dev/null 2>&1 <<SQL
insert into public.leads (full_name, phone, branch_id, assigned_to, created_by, created_at)
select 'bench'||g, '0150'||lpad(g::text,7,'0'), 'aaaaaaaa-0000-0000-0000-00000000000a'::uuid,
  case g%4 when 0 then '00000000-0000-0000-0000-0000000000a4'::uuid when 1 then '00000000-0000-0000-0000-0000000000c2'::uuid else null end,
  '00000000-0000-0000-0000-0000000000a2'::uuid, now() - (g||' minutes')::interval from generate_series(1,$1) g;
insert into public.lead_followups (lead_id, branch_id, due_at, status, created_by)
select id, branch_id, now() - interval '2 days', 'pending', created_by from public.leads l where l.full_name like 'bench%' and not exists (select 1 from public.lead_followups f where f.lead_id=l.id) limit $2;
analyze public.leads; analyze public.lead_followups;
SQL
}
STATE=full
MODE() { # original | definer_only | full   (always return to the original first, using the real rollback script)
  [ "$STATE" != original ] && $SU "psql -v ON_ERROR_STOP=1 -q -d $DB -f $RBK" >/dev/null 2>&1
  case "$1" in
    definer_only) $SU "psql -q -d $DB -c \"alter function public.can_manage_leads(uuid) security definer set search_path = ''\"" >/dev/null ;;
    full) $SU "psql -v ON_ERROR_STOP=1 -1 -q -d $DB -f $MIG" >/dev/null 2>&1 ;;
  esac; STATE=$1; }
for size in "800 370" "5000 3000"; do
  set -- $size; grow $1 $2
  N=$($SU "psql -Atd $DB -c 'select count(*) from public.leads'"); F=$($SU "psql -Atd $DB -c 'select count(*) from public.lead_followups'")
  for mode in original definer_only full; do MODE $mode
    for c in 1 8; do echo "BENCH leads=$N followups=$F mode=$mode clients=$c : $(bench x $c 10)"; done
  done
done
