#!/usr/bin/env bash
# LOCAL ONLY. Release B (Sales Workspace) suite: migration over existing leads, behaviour, concurrency, rollback. The schema is built WITHOUT the
# refund / financial migrations (20261118..22): Sales must not depend on them. Never touches any remote database.
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"; HERE="$(pwd)"; ROOT="$HERE/../../.."
DB="${SCRATCH_DB:-ninth_sales_b}"; RB="${SCRATCH_RB:-ninth_sales_b_rb}"; LOG="$HERE/.run-logs"; mkdir -p "$LOG"
SU="su postgres -c"; [ "$(id -u)" = "0" ] || SU="bash -c"
PW="$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
SUBSET="$LOG/migrations"; mkdir -p "$SUBSET"
for f in "$ROOT"/supabase/migrations/*.sql; do b=$(basename "$f"); case "$b" in 20261118*|20261119*|20261120*|20261121*|20261122*) ;; *) ln -sf "$f" "$SUBSET/$b";; esac; done
cleanup() { $SU "psql -q -d postgres -c 'drop database if exists $DB' -c 'drop database if exists $RB' -c 'drop role if exists scb_authn'" >/dev/null 2>&1; [ "${KEEP_LOGS:-0}" = "1" ] || rm -rf "$LOG"; }
[ "${KEEP_DB:-0}" = "1" ] || trap cleanup EXIT
MIGB="$ROOT/supabase/migrations/20261124000001_sales_workspace.sql"; RBKB="$ROOT/supabase/rollback/sales_workspace_rollback.sql"
build() { MIGRATIONS_DIR="$SUBSET" LOCAL_DB="$1" SKIP_SEED=1 STOP_BEFORE="${2:-}" bash "$ROOT/tools/local-dev-stack/apply.sh" > "$LOG/$1.apply.log" 2>&1 || { echo "build failed ($1)"; tail -5 "$LOG/$1.apply.log"; exit 1; }
  $SU "psql -v ON_ERROR_STOP=1 -q -d $1 -f $ROOT/tools/local-dev-stack/regression/00_seed.sql" > "$LOG/$1.seed.log" 2>&1 || { echo "seed failed ($1)"; exit 1; }; }
build "$DB" 20261124000001          # Release A applied, Release B not yet
$SU "psql -v ON_ERROR_STOP=1 -q -d $DB -f $HERE/release_a_setup.sql" > "$LOG/setup.log" 2>&1 || { echo "setup failed"; tail -5 "$LOG/setup.log"; exit 1; }
$SU "psql -q -d postgres" >/dev/null 2>&1 <<SQL
drop role if exists scb_authn; create role scb_authn login noinherit password '$PW'; grant anon, authenticated, service_role to scb_authn;
SQL
AUTHN() { PGPASSWORD="$PW" psql -h 127.0.0.1 -U scb_authn -d "$DB" "$@"; }
BEFORE="$($SU "psql -At -d $DB -c \"select (select count(*) from leads)||'/'||(select count(*) from lead_followups)||'/'||md5((select string_agg(l::text, ',' order by l.id) from leads l))\"")"
$SU "psql -v ON_ERROR_STOP=1 -1 -q -d $DB -f $MIGB" > "$LOG/migB.log" 2>&1; MX=$?
AFTER="$($SU "psql -At -d $DB -c \"select (select count(*) from leads)||'/'||(select count(*) from lead_followups)||'/'||md5((select string_agg((l.id,l.branch_id,l.full_name,l.phone,l.status,l.assigned_to,l.created_by)::text, ',' order by l.id) from leads l))\"")"
BEFORE2="$($SU "psql -At -d $DB -c \"select (select count(*) from leads)||'/'||(select count(*) from lead_followups)\"")"
echo "migration B exit=$MX; leads/followups before=$BEFORE2 (rows preserved, defaults: kind=call, interest=warm)"
AUTHN -q -f "$HERE/release_b_tests.sql" 2>"$LOG/err.txt" | sed -n '/===== RESULTS/,$p' > "$LOG/results.txt"
# ---------------- Release C part 1 (manager dashboard) ----------------
MIGC="$ROOT/supabase/migrations/20261125000001_sales_manager_dashboard.sql"; RBKC="$ROOT/supabase/rollback/sales_manager_dashboard_rollback.sql"
$SU "psql -v ON_ERROR_STOP=1 -1 -q -d $DB -f $MIGC" > "$LOG/migC.log" 2>&1; CX=$?
echo "migration C exit=$CX"
AUTHN -q -f "$HERE/release_c_tests.sql" 2>"$LOG/errc.txt" >/dev/null
# ---------------- Release C part 2 (conversion + integrity), on Production's shape (leftover 20-arg register_membership) ----------------
MIGC2="${MIGC2_FILE:-$ROOT/supabase/migrations/20261126000001_sales_conversion_and_integrity.sql}"; RBKC2="$ROOT/supabase/rollback/sales_conversion_and_integrity_rollback.sql"
$SU "psql -v ON_ERROR_STOP=1 -q -d $DB -f $HERE/prodshape_overload.sql" > "$LOG/overload.log" 2>&1 || { echo "overload fixture failed"; cat "$LOG/overload.log"; }
$SU "psql -v ON_ERROR_STOP=1 -1 -q -d $DB -f $MIGC2" > "$LOG/migC2.log" 2>&1; C2X=$?
echo "migration C2 exit=$C2X"; [ "$C2X" = 0 ] || tail -5 "$LOG/migC2.log"
AUTHN -q -f "$HERE/release_c2_tests.sql" 2>"$LOG/errc2.txt" >/dev/null
# ---------------- concurrency ----------------
A1='00000000-0000-0000-0000-0000000000a1'; A2='00000000-0000-0000-0000-0000000000a2'; S1='00000000-0000-0000-0000-0000000000a4'; S2='00000000-0000-0000-0000-0000000000c2'
$SU "psql -q -d $DB" >/dev/null 2>&1 <<'SQL'
create table if not exists scr.conc(label text, sess text, outcome text); grant all on scr.conc to public;
select scr.keep('own5', $s$select id::text from public.leads where full_name='own5'$s$);
select scr.keep('own4', $s$select id::text from public.leads where full_name='own4'$s$);
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
# C1: the owner logs two interactions at the same moment on one lead -> serialised; exactly ONE pending follow-up at the end
pair C1 "$S1" "public.log_lead_interaction(scr.id('own5'),'call','no_answer','first','call',now()+interval '1 day')" "$S1" "public.log_lead_interaction(scr.id('own5'),'whatsapp','message_sent','second','whatsapp',now()+interval '2 days')"
# C2: two managers' assignments of the same lead to different employees at the same moment -> serialised; history has BOTH moves in order, final owner = the later one
pair C2 "$A2" "public.assign_leads(array[scr.id('own4')], '$S1', 'race one')" "$A1" "public.assign_leads(array[scr.id('own4')], '$S2', 'race two')"
$SU "psql -q -d $DB" >/dev/null 2>&1 <<'SQL'
select scr.keep('convrace', $s$select id::text from public.leads where full_name='convrace'$s$);
select scr.keep('convrace2', $s$select id::text from public.leads where full_name='convrace2'$s$);
SQL
CONV() { echo "public.convert_lead(p_lead_id => scr.id('$1'), p_membership_type_id => 'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number => '$2', p_price => 1000, p_discount => 0, p_start_date => current_date, p_payment_method => 'cash')"; }
# CV1: owner double-submits the same conversion from two tabs at the same moment
pair CV1 "$S1" "$(CONV convrace RACE-1)" "$S1" "$(CONV convrace RACE-1)"
# CV2: owner and manager convert the same lead at the same moment with DIFFERENT receipt numbers
pair CV2 "$S1" "$(CONV convrace2 RACE-2A)" "$A2" "$(CONV convrace2 RACE-2B)"
$SU "psql -q -d $DB" >/dev/null 2>&1 <<'SQL'
insert into scr.res(id,who,what,expected,actual,pass)
select 'CV1','2 parallel sessions (sales A twice)','the same conversion submitted twice at the same moment (double click / two tabs)','both return without error; exactly ONE member, membership and payment; second is already_converted',
 (select string_agg(sess||':'||outcome,'; ' order by sess) from scr.conc where label='CV1')||' ; members='||(select count(*) from public.members where phone='0150000012')||' memberships='||(select count(*) from public.memberships m join public.members b on b.id=m.member_id where b.phone='0150000012')||' payments='||(select count(*) from public.membership_payments p join public.memberships m on m.id=p.membership_id join public.members b on b.id=m.member_id where b.phone='0150000012'),
 (select count(*) from scr.conc where label='CV1' and outcome='OK')=2 and (select count(*) from public.members where phone='0150000012')=1
 and (select count(*) from public.memberships m join public.members b on b.id=m.member_id where b.phone='0150000012')=1
 and (select count(*) from public.membership_payments p join public.memberships m on m.id=p.membership_id join public.members b on b.id=m.member_id where b.phone='0150000012')=1;
insert into scr.res(id,who,what,expected,actual,pass)
select 'CV2','2 parallel sessions (sales A, manager A)','owner and manager convert the same lead at the same moment with different receipts','one membership only (the first); the other gets already_converted; the second receipt number is never used; sold_by = owner',
 (select string_agg(sess||':'||outcome,'; ' order by sess) from scr.conc where label='CV2')||' ; memberships='||(select count(*) from public.memberships where receipt_number in ('RACE-2A','RACE-2B'))||' conversions='||(select count(*) from public.lead_conversions where lead_id=scr.id('convrace2')),
 (select count(*) from scr.conc where label='CV2' and outcome='OK')=2 and (select count(*) from public.memberships where receipt_number in ('RACE-2A','RACE-2B'))=1
 and (select count(*) from public.lead_conversions where lead_id=scr.id('convrace2'))=1
 and (select sold_by from public.memberships where receipt_number in ('RACE-2A','RACE-2B'))='00000000-0000-0000-0000-0000000000a4';
insert into scr.res(id,who,what,expected,actual,pass)
select 'C1','2 parallel sessions (sales A)','two interactions logged on one lead at the same moment','both complete without error; exactly 1 pending follow-up; 2 call/whatsapp activities',
 (select string_agg(sess||':'||outcome,'; ' order by sess) from scr.conc where label='C1')||' ; pending='||(select count(*) from public.lead_followups where lead_id=scr.id('own5') and status='pending')||' ; activities='||(select count(*) from public.lead_activities where lead_id=scr.id('own5') and kind in ('call','whatsapp')),
 (select count(*) from scr.conc where label='C1' and outcome='OK')=2 and (select count(*) from public.lead_followups where lead_id=scr.id('own5') and status='pending')=1
 and (select count(*) from public.lead_activities where lead_id=scr.id('own5') and kind in ('call','whatsapp'))=2;
insert into scr.res(id,who,what,expected,actual,pass)
select 'C2','2 parallel sessions (manager A, super admin)','two assignments of one lead to different employees at the same moment','both succeed in sequence; two history rows chained (second from = first to); final owner = last move',
 (select string_agg(sess||':'||outcome,'; ' order by sess) from scr.conc where label='C2')||' ; moves='||(select count(*) from public.lead_assignments where lead_id=scr.id('own4') and reason like 'race%'),
 (select count(*) from scr.conc where label='C2' and outcome='OK')=2
 and (select count(*) from public.lead_assignments where lead_id=scr.id('own4') and reason like 'race%')=2
 and (select (select to_owner from public.lead_assignments where lead_id=scr.id('own4') and reason like 'race%' order by created_at desc, id desc limit 1) = (select assigned_to from public.leads where id=scr.id('own4')));
SQL
# ---------------- rollback ----------------
$SU "psql -v ON_ERROR_STOP=1 -q -d $DB -f $RBKB" > "$LOG/rb_refused.log" 2>&1; RX1=$?; RMSG="$(grep -o 'ROLLBACK REFUSED[^.]*' "$LOG/rb_refused.log" | head -1)"
RKEPT="$($SU "psql -At -d $DB -c \"select (select count(*) from lead_activities)>0 and exists(select 1 from pg_proc where proname='log_lead_interaction')\"")"
build "$RB" 20261124000001
FPQ="select md5(coalesce((select string_agg(policyname||':'||coalesce(qual,'')||':'||coalesce(with_check,''), '|' order by policyname) from pg_policies where tablename in ('leads','lead_followups')),'')||(select string_agg(column_name, ',' order by table_name, column_name) from information_schema.columns where table_name in ('leads','lead_followups') and table_schema='public')||(select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid in ('leads'::regclass,'lead_followups'::regclass) and not tgisinternal)||(select string_agg(proname, ',' order by proname) from pg_proc where pronamespace='public'::regnamespace and proname in ('log_lead_interaction','assign_leads','get_my_worklist','my_sales_branch','can_manage_leads')))"
FP_A="$($SU "psql -At -d $RB -c \"$FPQ\"")"
$SU "psql -v ON_ERROR_STOP=1 -1 -q -d $RB -f $MIGB" > "$LOG/rb_apply.log" 2>&1; AX=$?
FP_B="$($SU "psql -At -d $RB -c \"$FPQ\"")"
$SU "psql -v ON_ERROR_STOP=1 -q -d $RB -f $RBKB" > "$LOG/rb_clean.log" 2>&1; RX2=$?
FP_R="$($SU "psql -At -d $RB -c \"$FPQ\"")"
$SU "psql -v ON_ERROR_STOP=1 -1 -q -d $RB -f $MIGB" > "$LOG/rb_reapply.log" 2>&1; AX2=$?
FP_B2="$($SU "psql -At -d $RB -c \"$FPQ\"")"
$SU "psql -v ON_ERROR_STOP=1 -q -d $DB -f $RBKC" > "$LOG/rbc.log" 2>&1; RCX=$?; $SU "psql -v ON_ERROR_STOP=1 -1 -q -d $DB -f $MIGC" > "$LOG/rbc2.log" 2>&1; RCX2=$?
CGONE="$($SU "psql -At -d $DB -c \"select count(*) from pg_proc where proname in ('get_sales_team_overview','get_sales_team_summary','get_attention_leads')\"")"
$SU "psql -v ON_ERROR_STOP=1 -q -d $DB -f $RBKC2" > "$LOG/rbc2_refused.log" 2>&1; R2X=$?; R2MSG="$(grep -o 'ROLLBACK REFUSED[^.]*' "$LOG/rbc2_refused.log" | head -1)"
R2KEPT="$($SU "psql -At -d $DB -c \"select exists(select 1 from pg_proc where proname='convert_lead') and exists(select 1 from pg_trigger where tgname='trg_guard_lead_direct_update')\"")"
FPQ2="select md5(coalesce((select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid in ('leads'::regclass,'lead_followups'::regclass) and not tgisinternal),'')||(select string_agg(p.oid::regprocedure::text||':'||md5(prosrc)||':'||coalesce(array_to_string(proacl,','),''), '|' order by p.oid::regprocedure::text) from pg_proc p where pronamespace='public'::regnamespace and proname in ('convert_lead_to_member','enforce_lead_insert_rules','convert_lead','finalize_lead_conversion','mark_lead_lost','reopen_lead'))||coalesce((select string_agg(relname, ',') from pg_class where relname='lead_conversions'),''))"
$SU "psql -v ON_ERROR_STOP=1 -1 -q -d $RB -f $MIGC" > "$LOG/rb_c.log" 2>&1
FP_C1="$($SU "psql -At -d $RB -c \"$FPQ2\"")"
$SU "psql -v ON_ERROR_STOP=1 -1 -q -d $RB -f $MIGC2" > "$LOG/rb_c2.log" 2>&1; C2A=$?
FP_C2="$($SU "psql -At -d $RB -c \"$FPQ2\"")"
$SU "psql -v ON_ERROR_STOP=1 -q -d $RB -f $RBKC2" > "$LOG/rb_c2_clean.log" 2>&1; C2R=$?
FP_C2R="$($SU "psql -At -d $RB -c \"$FPQ2\"")"
$SU "psql -v ON_ERROR_STOP=1 -1 -q -d $RB -f $MIGC2" > "$LOG/rb_c2_re.log" 2>&1; C2A2=$?
FP_C22="$($SU "psql -At -d $RB -c \"$FPQ2\"")"
OKC2R=false; [ "$R2X" != 0 ] && [ -n "$R2MSG" ] && [ "$R2KEPT" = "t" ] && OKC2R=true
OKC2F=false; [ "$C2A" = 0 ] && [ "$C2R" = 0 ] && [ "$C2A2" = 0 ] && [ "$FP_C2R" = "$FP_C1" ] && [ "$FP_C2" != "$FP_C1" ] && [ "$FP_C22" = "$FP_C2" ] && OKC2F=true
OKC=false; [ "$CX" = 0 ] && [ "$RCX" = 0 ] && [ "$RCX2" = 0 ] && [ "$CGONE" = 3 ] && OKC=true
OK1=false; [ "$MX" = 0 ] && OK1=true
OK2=false; [ "$RX1" != 0 ] && [ -n "$RMSG" ] && [ "$RKEPT" = "t" ] && OK2=true
OK3=false; [ "$AX" = 0 ] && [ "$RX2" = 0 ] && [ "$FP_R" = "$FP_A" ] && [ "$FP_B" != "$FP_A" ] && [ "$AX2" = 0 ] && [ "$FP_B2" = "$FP_B" ] && OK3=true
$SU "psql -q -d $DB" >/dev/null 2>&1 <<SQL
insert into scr.res(id,who,what,expected,actual,pass) values
 ('M01','postgres','apply Release B over a database that already holds leads and follow-ups (one transaction)','exit 0; row counts unchanged','exit=$MX before=$BEFORE2 after=$(echo $AFTER | cut -d/ -f1,2)', $OK1 and '$BEFORE2' = '$(echo $AFTER | cut -d/ -f1,2)'),
 ('M02','postgres','run the rollback while history rows exist','refused (ROLLBACK REFUSED); objects unchanged','exit=$RX1 msg=[$RMSG] kept=$RKEPT', $OK2),
 ('M04','postgres','Release C migration applies in one transaction; its rollback removes the three read-only functions; re-apply restores them','exit 0 / 0 / 0; 3 functions','apply=$CX rollback=$RCX reapply=$RCX2 functions=$CGONE', $OKC),
 ('M05','postgres','Release C2 migration applies in one transaction over existing data; its rollback is refused while conversions exist','apply exit 0; rollback refused; objects kept','apply=$C2X rollback_exit=$R2X msg=[$R2MSG] kept=$R2KEPT', $OKC2R and '$C2X' = '0'),
 ('M06','postgres (clean database)','C2 rollback restores the C1 shape exactly (triggers, original convert_lead_to_member body + ACL, insert rules); re-apply reproduces C2','fingerprints match','apply=$C2A rollback=$C2R reapply=$C2A2 restored=$([ "$FP_C2R" = "$FP_C1" ] && echo yes || echo no) same=$([ "$FP_C22" = "$FP_C2" ] && echo yes || echo no)', $OKC2F),
 ('M03','postgres (clean database)','rollback restores the Release A shape exactly; re-apply reproduces Release B','fingerprints: rollback = Release A, re-apply = first apply','apply=$AX rollback=$RX2 reapply=$AX2 restored=$([ "$FP_R" = "$FP_A" ] && echo yes || echo no) same_as_first=$([ "$FP_B2" = "$FP_B" ] && echo yes || echo no)', $OK3);
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
