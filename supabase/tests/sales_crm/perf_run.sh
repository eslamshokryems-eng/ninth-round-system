#!/usr/bin/env bash
# LOCAL ONLY. Sales CRM performance at scale with ALL Sales migrations (A, B, C1, C2): 20,000 leads in one branch over 10 employees, a pending
# follow-up on most, ~60,000 history rows. Times the employee and manager screens' queries (median of 7 runs) and runs pgbench with 8
# concurrent clients. Local hardware: the numbers show scale behaviour and ratios, NOT Production latency.
set -u
cd "$(dirname "${BASH_SOURCE[0]}")"; HERE="$(pwd)"; ROOT="$HERE/../../.."; DB="${PERF_DB:-ninth_sales_perf}"; LOG="/tmp/sales-perf"; rm -rf "$LOG"; mkdir -p "$LOG/m"; chmod 755 "$LOG" "$LOG/m"
SU="su postgres -c"
for f in "$ROOT"/supabase/migrations/*.sql; do b=$(basename "$f"); case "$b" in 20261118*|20261119*|20261120*|20261121*|20261122*) ;; *) ln -sf "$f" "$LOG/m/$b";; esac; done
$SU "psql -q -d postgres -c 'drop database if exists $DB'" >/dev/null 2>&1
MIGRATIONS_DIR="$LOG/m" LOCAL_DB="$DB" SKIP_SEED=1 bash "$ROOT/tools/local-dev-stack/apply.sh" > "$LOG/apply.log" 2>&1 || { echo "build failed"; tail -5 "$LOG/apply.log"; exit 1; }
$SU "psql -v ON_ERROR_STOP=1 -q -d $DB -f $ROOT/tools/local-dev-stack/regression/00_seed.sql" > "$LOG/seed.log" 2>&1 || { echo seed failed; exit 1; }
cp "$HERE/release_a_setup.sql" "$LOG/setup.sql"; chmod 644 "$LOG/setup.sql"
$SU "psql -v ON_ERROR_STOP=1 -q -d $DB -f $LOG/setup.sql" > "$LOG/setup.log" 2>&1 || { echo setup failed; tail -3 "$LOG/setup.log"; exit 1; }
cat > "$LOG/bulk.sql" <<'SQL'
-- 8 more sales employees in branch A
insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
select ('00000000-0000-0000-0000-0000000009'||lpad(g::text,2,'0'))::uuid, 'perf'||g||'@t.local', 'x', jsonb_build_object('full_name','Perf Sales '||g) from generate_series(1,8) g;
update profiles set role='sales_employee', branch_id='aaaaaaaa-0000-0000-0000-00000000000a' where id::text like '00000000-0000-0000-0000-0000000009%';
create temp table emp as select id, row_number() over (order by id) - 1 as n from profiles where branch_id='aaaaaaaa-0000-0000-0000-00000000000a' and role='sales_employee' and is_active;
insert into leads (full_name, phone, branch_id, assigned_to, created_by, status, source, interest_level, last_contacted_at, created_at)
select 'Perf Lead '||g, '0199'||lpad(g::text,7,'0'), 'aaaaaaaa-0000-0000-0000-00000000000a',
       (select id from emp where n = g % (select count(*) from emp)), '00000000-0000-0000-0000-0000000000a2',
       (array['new','contacted','follow_up','follow_up','lost','converted'])[1 + g % 6]::lead_status, 'phone',
       (array['hot','warm','cold'])[1 + g % 3], case when g % 4 = 0 then null else now() - (g % 30) * interval '1 day' end,
       now() - (g % 90) * interval '1 day'
from generate_series(1, 20000) g;
insert into lead_followups (lead_id, branch_id, due_at, status, created_by, kind)
select id, branch_id, now() + ((abs(hashtext(id::text)) % 14) - 7) * interval '1 day', 'pending', created_by, 'call'
from leads where full_name like 'Perf Lead %' and status in ('new','contacted','follow_up') and abs(hashtext(id::text)) % 10 <> 0;
insert into lead_activities (lead_id, branch_id, actor_id, actor_name, kind, outcome, occurred_at)
select l.id, l.branch_id, l.assigned_to, 'Perf', (array['call','whatsapp','visit'])[1 + k % 3], 'interested', now() - (k * 3) * interval '1 day'
from leads l cross join generate_series(1, 3) k where l.full_name like 'Perf Lead %';
analyze;
SQL
chmod 644 "$LOG/bulk.sql"
$SU "psql -v ON_ERROR_STOP=1 -q -d $DB -f $LOG/bulk.sql" > "$LOG/bulk.log" 2>&1 || { echo bulk failed; tail -3 "$LOG/bulk.log"; exit 1; }
COUNTS="$($SU "psql -At -d $DB -c \"select (select count(*) from leads)||' leads, '||(select count(*) from lead_followups)||' follow-ups, '||(select count(*) from lead_activities)||' history rows'\"")"
echo "dataset: $COUNTS"
cat > "$LOG/time.sql" <<'SQL'
create or replace function pg_temp.med(p_sub text, p_sql text, p_n int default 7) returns numeric language plpgsql as $$
declare t0 timestamptz; a numeric[] := '{}'; i int; begin
  perform set_config('request.jwt.claims', json_build_object('role','authenticated','sub',p_sub)::text, true);
  for i in 1..p_n loop
    execute 'set local role authenticated';
    t0 := clock_timestamp(); execute p_sql; a := a || extract(epoch from clock_timestamp() - t0) * 1000;
    execute 'reset role';
  end loop;
  return round((select percentile_cont(0.5) within group (order by x) from unnest(a) x)::numeric, 1); end $$;
\pset format unaligned
\pset fieldsep ' | '
\pset tuples_only on
select 'employee  | all own leads (RLS)                     | '||pg_temp.med('00000000-0000-0000-0000-0000000000a4','select count(*) from public.leads')||' ms';
select 'employee  | get_my_worklist(100)                    | '||pg_temp.med('00000000-0000-0000-0000-0000000000a4','select count(*) from public.get_my_worklist(null,100,0)')||' ms';
select 'employee  | get_worklist_summary                    | '||pg_temp.med('00000000-0000-0000-0000-0000000000a4','select * from public.get_worklist_summary()')||' ms';
select 'employee  | follow-ups due today (RLS)              | '||pg_temp.med('00000000-0000-0000-0000-0000000000a4','select count(*) from public.lead_followups where status=''pending'' and due_at >= date_trunc(''day'', now()) and due_at < date_trunc(''day'', now()) + interval ''1 day''')||' ms';
select 'employee  | overdue follow-ups (RLS)                | '||pg_temp.med('00000000-0000-0000-0000-0000000000a4','select count(*) from public.lead_followups where status=''pending'' and due_at < now()')||' ms';
select 'employee  | lead history (one lead)                 | '||pg_temp.med('00000000-0000-0000-0000-0000000000a4','select count(*) from public.get_lead_activities((select id from public.leads where assigned_to=''00000000-0000-0000-0000-0000000000a4'' limit 1))')||' ms';
select 'employee  | search leads by name (ILIKE)            | '||pg_temp.med('00000000-0000-0000-0000-0000000000a4','select count(*) from (select id from public.leads where full_name ilike ''%Lead 12%'' or phone ilike ''%12%'' limit 50) x')||' ms';
select 'manager   | branch leads page (50, newest)          | '||pg_temp.med('00000000-0000-0000-0000-0000000000a2','select count(*) from (select id from public.leads order by created_at desc limit 50) x')||' ms';
select 'manager   | get_sales_team_summary                  | '||pg_temp.med('00000000-0000-0000-0000-0000000000a2','select * from public.get_sales_team_summary()')||' ms';
select 'manager   | get_sales_team_overview (10 employees)  | '||pg_temp.med('00000000-0000-0000-0000-0000000000a2','select count(*) from public.get_sales_team_overview()')||' ms';
select 'manager   | get_attention_leads(overdue, 100)       | '||pg_temp.med('00000000-0000-0000-0000-0000000000a2','select count(*) from public.get_attention_leads(''overdue'')')||' ms';
select 'manager   | get_attention_leads(no_recent_contact)  | '||pg_temp.med('00000000-0000-0000-0000-0000000000a2','select count(*) from public.get_attention_leads(''no_recent_contact'')')||' ms';
select 'manager   | worklist of one employee                | '||pg_temp.med('00000000-0000-0000-0000-0000000000a2','select count(*) from public.get_my_worklist(''00000000-0000-0000-0000-0000000000a4'',100,0)')||' ms';
SQL
chmod 644 "$LOG/time.sql"
$SU "psql -q -d $DB -f $LOG/time.sql" 2>&1 | grep -v '^$' | tee "$LOG/times.txt"
# writes (single, real commits): one interaction and one conversion
cat > "$LOG/write.sql" <<'SQL'
select set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a4"}',false); set role authenticated;
\timing on
select public.log_lead_interaction((select id from public.leads where assigned_to='00000000-0000-0000-0000-0000000000a4' and status in ('new','contacted','follow_up') limit 1), 'call','interested','perf','call', now()+interval '1 day') is not null as interaction;
select already_converted from public.convert_lead(p_lead_id => (select id from public.leads where assigned_to='00000000-0000-0000-0000-0000000000a4' and status in ('new','contacted','follow_up') offset 5 limit 1), p_membership_type_id => 'cccccccc-0000-0000-0000-0000000000c1', p_receipt_number => 'PERF-1', p_price => 1000, p_discount => 0, p_start_date => current_date, p_payment_method => 'cash');
SQL
chmod 644 "$LOG/write.sql"
$SU "psql -q -d $DB -f $LOG/write.sql" 2>&1 | grep -E "Time|^ ?[tf]$" | paste - - | sed 's/^/write     | /' | tee -a "$LOG/times.txt"
# concurrency: 8 employees' clients hitting the workspace (summary + worklist) for 20 s
cat > "$LOG/ws.pgb" <<'SQL'
\set e random(1, 8)
begin;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000009' || lpad(:e::text, 2, '0') || '"}', true);
set local role authenticated;
select * from public.get_worklist_summary();
select count(*) from public.get_my_worklist(null, 100, 0);
commit;
SQL
chmod 644 "$LOG/ws.pgb"
$SU "pgbench -n -c 8 -j 4 -T 20 -f $LOG/ws.pgb $DB" 2>&1 | grep -E "latency average|tps|failed" | sed 's/^/pgbench 8 clients | /' | tee -a "$LOG/times.txt"
cp "$LOG/times.txt" "${OUT_FILE:-/dev/null}" 2>/dev/null
[ "${KEEP_DB:-0}" = "1" ] || $SU "psql -q -d postgres -c 'drop database if exists $DB'" >/dev/null 2>&1
