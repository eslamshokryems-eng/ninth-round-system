#!/usr/bin/env bash
# LOCAL ONLY. Release B (Sales Workspace) suite, B ONLY (no C1 / C2), on PRODUCTION'S SHAPE: Release A applied + the Production-only trigger
# trg_enforce_lead_assignment_rules (prodshape_lead_assignment_trigger.sql). Never touches any remote database.
# Covers: migration over existing data in ONE transaction with lock/statement timeouts; behaviour (release_b_tests.sql); interplay with the
# Production trigger (release_b_prodshape_tests.sql); concurrency; BEHAVIOURAL rollback with history present + re-enable; FULL rollback refused
# with history; on a clean database FULL rollback = Release A exactly and re-apply = Release B exactly (catalog fingerprints, release_b_fp.sql).
# PostgreSQL version: whatever server PGPORT points at (PG16 on 5432, PG17 on 5433 in this sandbox). Usage: [PGPORT=5433] bash release_b_run.sh
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"; HERE="$(pwd)"; ROOT="$HERE/../../.."
DB="${SCRATCH_DB:-ninth_sales_b}"; RB="${SCRATCH_RB:-ninth_sales_b_rb}"; LOG="$HERE/.run-logs"; mkdir -p "$LOG"; chmod 755 "$LOG"
SU="su postgres -c"; [ "$(id -u)" = "0" ] || SU="bash -c"
PW="$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
SUBSET="$LOG/migrations"; mkdir -p "$SUBSET"
for f in "$ROOT"/supabase/migrations/*.sql; do ln -sf "$f" "$SUBSET/$(basename "$f")"; done
cleanup() { $SU "psql -q -d postgres -c 'drop database if exists $DB' -c 'drop database if exists $RB' -c 'drop role if exists scb_authn'" >/dev/null 2>&1; [ "${KEEP_LOGS:-0}" = "1" ] || rm -rf "$LOG"; }
[ "${KEEP_DB:-0}" = "1" ] || trap cleanup EXIT
MIGB="$ROOT/supabase/migrations/20261124000001_sales_workspace.sql"
RBK_FULL="$ROOT/supabase/rollback/sales_workspace_rollback.sql"
RBK_BEH="$ROOT/supabase/rollback/sales_workspace_rollback_behavioral.sql"
REEN="$ROOT/supabase/rollback/sales_workspace_reenable.sql"
PSQL() { local db="$1"; shift; $SU "psql -v ON_ERROR_STOP=1 -q -d $db $*"; }
FP() { $SU "psql -q -d $1 -f $HERE/release_b_fp.sql" 2>&1; }
build() { MIGRATIONS_DIR="$SUBSET" LOCAL_DB="$1" SKIP_SEED=1 STOP_BEFORE=20261124000001 bash "$ROOT/tools/local-dev-stack/apply.sh" > "$LOG/$1.apply.log" 2>&1 || { echo "build failed ($1)"; tail -5 "$LOG/$1.apply.log"; exit 1; }
  PSQL "$1" "-f $ROOT/tools/local-dev-stack/regression/00_seed.sql" > "$LOG/$1.seed.log" 2>&1 || { echo "seed failed ($1)"; exit 1; }
  PSQL "$1" "-f $HERE/prodshape_lead_assignment_trigger.sql" > "$LOG/$1.prodshape.log" 2>&1 || { echo "prodshape fixture failed ($1)"; cat "$LOG/$1.prodshape.log"; exit 1; }; }
# Release B is applied exactly as it would be in Production: one transaction, lock_timeout 5s, statement_timeout 30s.
applyB() { $SU "psql -v ON_ERROR_STOP=1 -1 -q -d $1 -c \"set local lock_timeout = '5s'\" -c \"set local statement_timeout = '30s'\" -f $MIGB"; }
SERVER="$($SU "psql -At -d postgres -c 'show server_version'")"
echo "server: PostgreSQL $SERVER (port ${PGPORT:-5432})"

# ======================= main database: A + Production trigger, data, then B =======================
build "$DB"
PSQL "$DB" "-f $HERE/release_a_setup.sql" > "$LOG/setup.log" 2>&1 || { echo "setup failed"; tail -5 "$LOG/setup.log"; exit 1; }
$SU "psql -q -d postgres" >/dev/null 2>&1 <<SQL
drop role if exists scb_authn; create role scb_authn login noinherit password '$PW'; grant anon, authenticated, service_role to scb_authn;
SQL
AUTHN() { PGPASSWORD="$PW" psql -h 127.0.0.1 -U scb_authn -d "$DB" "$@"; }
FP "$DB" > "$LOG/fp_A_main.txt"
ROWS="select (select count(*) from leads)||'/'||(select count(*) from lead_followups)||'/'||md5((select string_agg((l.id,l.branch_id,l.full_name,l.phone,l.status,l.assigned_to,l.created_by)::text, ',' order by l.id) from leads l))||'/'||md5((select string_agg((f.id,f.lead_id,f.due_at,f.status,f.note)::text, ',' order by f.id) from lead_followups f))"
BEFORE="$($SU "psql -At -d $DB -c \"$ROWS\"")"
applyB "$DB" > "$LOG/migB.log" 2>&1; MX=$?
AFTER="$($SU "psql -At -d $DB -c \"$ROWS\"")"
FP "$DB" > "$LOG/fp_B_main.txt"
echo "migration B exit=$MX; rows identical after=$([ "$BEFORE" = "$AFTER" ] && echo yes || echo NO)"
AUTHN -q -f "$HERE/release_b_tests.sql" 2>"$LOG/err_b.txt" >/dev/null
AUTHN -q -f "$HERE/release_b_prodshape_tests.sql" 2>"$LOG/err_p.txt" >/dev/null

# ---------------- concurrency ----------------
A1='00000000-0000-0000-0000-0000000000a1'; A2='00000000-0000-0000-0000-0000000000a2'; S1='00000000-0000-0000-0000-0000000000a4'; S2='00000000-0000-0000-0000-0000000000c2'
$SU "psql -q -d $DB" >/dev/null 2>&1 <<'SQL'
create table if not exists scr.conc(label text, sess text, outcome text); grant all on scr.conc to public;
select scr.keep('own1', $s$select id::text from public.leads where full_name='own1'$s$);
select scr.keep('other3', $s$select id::text from public.leads where full_name='other3'$s$);
SQL
pair() { local label="$1" sub1="$2" sql1="$3" sub2="$4" sql2="$5"
  cat > "$LOG/$label.1.sql" <<SQL
select set_config('request.jwt.claims','{"role":"authenticated","sub":"$sub1"}',false); set role authenticated;
begin;
do \$\$ begin perform $sql1; insert into scr.conc values ('$label','s1','OK'); exception when others then insert into scr.conc values ('$label','s1','ERR '||left(sqlerrm,80)); end \$\$;
select pg_sleep(3);
commit;
SQL
  cat > "$LOG/$label.2.sql" <<SQL
select set_config('request.jwt.claims','{"role":"authenticated","sub":"$sub2"}',false); set role authenticated;
do \$\$ begin perform $sql2; insert into scr.conc values ('$label','s2','OK'); exception when others then insert into scr.conc values ('$label','s2','ERR '||left(sqlerrm,80)); end \$\$;
SQL
  chmod a+r "$LOG"/$label.*.sql
  AUTHN -q -f "$LOG/$label.1.sql" >/dev/null 2>&1 & local p1=$!; sleep 1.2
  AUTHN -q -f "$LOG/$label.2.sql" >/dev/null 2>&1 & local p2=$!; wait $p1 $p2; }
# C1: the owner logs two interactions on one lead at the same moment -> serialised; exactly ONE pending follow-up at the end
pair C1 "$S1" "public.log_lead_interaction(scr.id('own1'),'call','no_answer','first','call',now()+interval '1 day')" "$S1" "public.log_lead_interaction(scr.id('own1'),'whatsapp','message_sent','second','whatsapp',now()+interval '2 days')"
# C2: manager and Super Admin assign the same lead to different employees at the same moment -> serialised through the Production trigger
pair C2 "$A2" "public.assign_leads(array[scr.id('other3')], '$S1', 'race one')" "$A1" "public.assign_leads(array[scr.id('other3')], '$S2', 'race two')"
$SU "psql -q -d $DB" >/dev/null 2>&1 <<'SQL'
insert into scr.res(id,who,what,expected,actual,pass)
select 'C1','2 parallel sessions (sales A)','two interactions logged on one lead at the same moment','both complete; exactly 1 pending follow-up; the 2 interactions recorded',
 (select string_agg(sess||':'||outcome,'; ' order by sess) from scr.conc where label='C1')||' ; pending='||(select count(*) from public.lead_followups where lead_id=scr.id('own1') and status='pending')||' ; new activities='||(select count(*) from public.lead_activities where lead_id=scr.id('own1') and note in ('first','second')),
 (select count(*) from scr.conc where label='C1' and outcome='OK')=2 and (select count(*) from public.lead_followups where lead_id=scr.id('own1') and status='pending')=1
 and (select count(*) from public.lead_activities where lead_id=scr.id('own1') and note in ('first','second'))=2;
insert into scr.res(id,who,what,expected,actual,pass)
select 'C2','2 parallel sessions (manager A, super admin)','two assignments of one lead to different employees at the same moment (Production trigger in place)','both succeed in sequence; two history rows chained; final owner = last move',
 (select string_agg(sess||':'||outcome,'; ' order by sess) from scr.conc where label='C2')||' ; moves='||(select count(*) from public.lead_assignments where lead_id=scr.id('other3') and reason like 'race%'),
 (select count(*) from scr.conc where label='C2' and outcome='OK')=2
 and (select count(*) from public.lead_assignments where lead_id=scr.id('other3') and reason like 'race%')=2
 and (select (select to_owner from public.lead_assignments where lead_id=scr.id('other3') and reason like 'race%' order by created_at desc, id desc limit 1) = (select assigned_to from public.leads where id=scr.id('other3')))
 and (select (select from_owner from public.lead_assignments where lead_id=scr.id('other3') and reason like 'race%' order by created_at desc, id desc limit 1) = (select to_owner from public.lead_assignments where lead_id=scr.id('other3') and reason like 'race%' order by created_at asc, id asc limit 1));
SQL

# ---------------- rollbacks on the USED database (history exists) ----------------
FP "$DB" > "$LOG/fp_used_before_rb.txt"
PSQL "$DB" "-f $RBK_FULL" > "$LOG/rb_full_refused.log" 2>&1; RX1=$?; RMSG="$(grep -o 'ROLLBACK REFUSED[^.]*' "$LOG/rb_full_refused.log" | head -1)"
FP "$DB" > "$LOG/fp_after_refused.txt"
$SU "psql -q -d $DB" >/dev/null 2>&1 <<'SQL'
select scr.keep('hist_before', $s$select (select count(*) from public.lead_activities)||'/'||(select count(*) from public.lead_assignments)$s$);
SQL
PSQL "$DB" "-f $RBK_BEH" > "$LOG/rb_beh.log" 2>&1; BX=$?
FP "$DB" > "$LOG/fp_beh_main.txt"
$SU "psql -q -d $DB" >/dev/null 2>&1 <<'SQL'
select scr.keep('expect_salesA', $s$select count(*)::text from public.leads where branch_id='aaaaaaaa-0000-0000-0000-00000000000a' and (assigned_to='00000000-0000-0000-0000-0000000000a4' or assigned_to is null)$s$);
SQL
AUTHN -q -f "$HERE/release_b_rollback_tests.sql" 2>"$LOG/err_r.txt" >/dev/null
PSQL "$DB" "-f $REEN" > "$LOG/reenable.log" 2>&1; EX=$?
FP "$DB" > "$LOG/fp_reen_main.txt"
REEN_VIS="$(AUTHN -At -q <<'SQL'
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a4"}',false) \g /dev/null
set role authenticated;
select (select count(*) from public.leads where assigned_to is distinct from '00000000-0000-0000-0000-0000000000a4')||'/'||(select count(*) from public.get_my_worklist());
SQL
)"
OWN_ACTIVE="$($SU "psql -At -d $DB -c \"select count(*) from leads where assigned_to='00000000-0000-0000-0000-0000000000a4' and status in ('new','contacted','follow_up')\"")"

# ======================= clean database: full rollback / re-apply fingerprints =======================
build "$RB"
FP "$RB" > "$LOG/fp_A.txt"
applyB "$RB" > "$LOG/rb_apply.log" 2>&1; AX=$?;                    FP "$RB" > "$LOG/fp_B.txt"
PSQL "$RB" "-f $RBK_BEH" > "$LOG/rb_beh_clean.log" 2>&1; BX2=$?;   FP "$RB" > "$LOG/fp_beh.txt"
PSQL "$RB" "-f $REEN" > "$LOG/rb_reen_clean.log" 2>&1; EX2=$?;     FP "$RB" > "$LOG/fp_reen.txt"
PSQL "$RB" "-f $RBK_FULL" > "$LOG/rb_full_clean.log" 2>&1; RX2=$?; FP "$RB" > "$LOG/fp_R.txt"
applyB "$RB" > "$LOG/rb_reapply.log" 2>&1; AX2=$?;                  FP "$RB" > "$LOG/fp_B2.txt"
sect() { grep "^$1	" "$2" | cut -f2; }
same() { cmp -s "$1" "$2" && echo yes || echo no; }
POL_A="$(sect policies_leads "$LOG/fp_A.txt")"; POL_BEH="$(sect policies_leads "$LOG/fp_beh.txt")"; POL_BEHM="$(sect policies_leads "$LOG/fp_beh_main.txt")"
CHANGED_BY_BEH="$(diff "$LOG/fp_B.txt" "$LOG/fp_beh.txt" | grep '^>' | sed 's/^> //' | cut -f1 | sort | tr '\n' ',')"
OK_M1=false; [ "$MX" = 0 ] && [ "$BEFORE" = "$AFTER" ] && OK_M1=true
OK_M2=false; [ "$RX1" != 0 ] && [ -n "$RMSG" ] && [ "$(same "$LOG/fp_used_before_rb.txt" "$LOG/fp_after_refused.txt")" = yes ] && OK_M2=true
OK_M3=false; [ "$BX" = 0 ] && [ "$POL_BEHM" = "$POL_A" ] && OK_M3=true
OK_M4=false; [ "$EX" = 0 ] && [ "$(same "$LOG/fp_reen_main.txt" "$LOG/fp_B_main.txt")" = yes ] && [ "$REEN_VIS" = "0/$OWN_ACTIVE" ] && OK_M4=true
OK_M5=false; [ "$AX" = 0 ] && [ "$BX2" = 0 ] && [ "$EX2" = 0 ] && [ "$POL_BEH" = "$POL_A" ] && [ "$CHANGED_BY_BEH" = "functions,policies_leads,triggers," ] && [ "$(same "$LOG/fp_reen.txt" "$LOG/fp_B.txt")" = yes ] && OK_M5=true
OK_M6=false; [ "$RX2" = 0 ] && [ "$(same "$LOG/fp_R.txt" "$LOG/fp_A.txt")" = yes ] && [ "$(same "$LOG/fp_B.txt" "$LOG/fp_A.txt")" = no ] && [ "$AX2" = 0 ] && [ "$(same "$LOG/fp_B2.txt" "$LOG/fp_B.txt")" = yes ] && OK_M6=true
OK_M7=false; [ "$(same "$LOG/fp_A_main.txt" "$LOG/fp_A.txt")" = yes ] && [ "$(same "$LOG/fp_B_main.txt" "$LOG/fp_B.txt")" = yes ] && OK_M7=true
$SU "psql -q -d $DB" >/dev/null 2>&1 <<SQL
insert into scr.res(id,who,what,expected,actual,pass) values
 ('M01','postgres','apply Release B over a database holding leads + follow-ups: ONE transaction, lock_timeout 5s, statement_timeout 30s','exit 0; every existing lead / follow-up row byte-identical','exit=$MX rows_identical=$([ "$BEFORE" = "$AFTER" ] && echo yes || echo no)', $OK_M1),
 ('M02','postgres','FULL rollback while history exists','refused (ROLLBACK REFUSED); catalog unchanged','exit=$RX1 msg=[$RMSG] unchanged=$(same "$LOG/fp_used_before_rb.txt" "$LOG/fp_after_refused.txt")', $OK_M2),
 ('M03','postgres','BEHAVIOURAL rollback on the used database (history present)','exit 0; leads policies = Release A exactly','exit=$BX policies_equal_A=$([ "$POL_BEHM" = "$POL_A" ] && echo yes || echo no)', $OK_M3),
 ('M04','postgres','re-enable after the behavioural rollback (used database)','exit 0; catalog = Release B exactly; employee again sees only own leads; worklist works','exit=$EX catalog_equal_B=$(same "$LOG/fp_reen_main.txt" "$LOG/fp_B_main.txt") foreign_visible/worklist=$REEN_VIS own_active=$OWN_ACTIVE', $OK_M4),
 ('M05','postgres (clean database)','behavioural rollback changes ONLY policies, trigger enable flags and function EXECUTE grants; re-enable = Release B exactly','changed = functions,policies_leads,triggers; policies = A; re-enable = B','apply=$AX beh=$BX2 reen=$EX2 changed=[$CHANGED_BY_BEH] policies_equal_A=$([ "$POL_BEH" = "$POL_A" ] && echo yes || echo no) reen_equal_B=$(same "$LOG/fp_reen.txt" "$LOG/fp_B.txt")', $OK_M5),
 ('M06','postgres (clean database)','FULL rollback restores the Release A catalog exactly (every section); re-apply reproduces Release B exactly','fp(rollback) = fp(A); fp(re-apply) = fp(B)','rollback=$RX2 equal_A=$(same "$LOG/fp_R.txt" "$LOG/fp_A.txt") reapply=$AX2 equal_B=$(same "$LOG/fp_B2.txt" "$LOG/fp_B.txt")', $OK_M6),
 ('M07','postgres','clean and used databases have the same catalog before and after B (data-independent migration)','fp equal','A=$(same "$LOG/fp_A_main.txt" "$LOG/fp_A.txt") B=$(same "$LOG/fp_B_main.txt" "$LOG/fp_B.txt")', $OK_M7);
SQL
cat > "$LOG/final.sql" <<'SQL'
\pset tuples_only on
\pset format unaligned
\echo ===== COMPLETE RESULTS =====
select format('%-5s %-4s | %-32s | %-100s | exp: %s | act: %s', id, case when pass then 'PASS' else 'FAIL' end, left(who,32), left(what,100), expected, actual) from scr.res order by ord;
select 'SUMMARY total='||count(*)||' pass='||count(*) filter (where pass)||' fail='||count(*) filter (where not pass) from scr.res;
SQL
chmod a+r "$LOG/final.sql"; $SU "psql -q -d $DB" < "$LOG/final.sql" > "$LOG/final.txt"
[ -n "${SHOW_ALL:-}" ] && cat "$LOG/final.txt" || grep -E " FAIL |SUMMARY" "$LOG/final.txt"
cp "$LOG/final.txt" "${OUT_FILE:-/dev/null}" 2>/dev/null
F="$($SU "psql -At -d $DB -c \"select count(*) from scr.res where not pass\"")"; [ "$F" = "0" ]
