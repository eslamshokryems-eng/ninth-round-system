-- LOCAL ONLY. Release C part 1: Manager Dashboard (read-only). Runs after the Release B tests on the same database (state left by them is fine:
-- every expectation is computed by an INDEPENDENT hand-written query on the base tables and compared with the RPC output).
\set QUIET on
\pset tuples_only on
\pset format unaligned
\set ON_ERROR_STOP off
\set act_super  'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1"}'',false); set role authenticated;'
\set act_mgrA   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a2"}'',false); set role authenticated;'
\set act_recepA 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a3"}'',false); set role authenticated;'
\set act_salesA 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a4"}'',false); set role authenticated;'
\set act_coachA 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a5"}'',false); set role authenticated;'
\set act_mgrB   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c3"}'',false); set role authenticated;'
\set act_salesB 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c4"}'',false); set role authenticated;'
\set act_anon   'select set_config(''request.jwt.claims'',''{"role":"anon"}'',false); set role anon;'
\set done 'reset role;'
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''
-- independent facts (superuser): active leads per branch, overdue (distinct leads), no next action, unassigned
:act_mgrA
select scr.eq('K01','manager A','summary = independent counts (active / unassigned / overdue leads / no next action / hot)',
 $q$select (select concat_ws('/',active_leads,unassigned_leads,overdue_leads,no_next_action,hot_leads) from public.get_sales_team_summary())
    = (select concat_ws('/',
        (select count(*) from public.leads where branch_id='aaaaaaaa-0000-0000-0000-00000000000a' and status in ('new','contacted','follow_up')),
        (select count(*) from public.leads where branch_id='aaaaaaaa-0000-0000-0000-00000000000a' and status in ('new','contacted','follow_up') and assigned_to is null),
        (select count(*) from public.leads l where l.branch_id='aaaaaaaa-0000-0000-0000-00000000000a' and l.status in ('new','contacted','follow_up') and exists (select 1 from public.lead_followups f where f.lead_id=l.id and f.status='pending' and f.due_at < now())),
        (select count(*) from public.leads l where l.branch_id='aaaaaaaa-0000-0000-0000-00000000000a' and l.status in ('new','contacted','follow_up') and not exists (select 1 from public.lead_followups f where f.lead_id=l.id and f.status='pending')),
        (select count(*) from public.leads where branch_id='aaaaaaaa-0000-0000-0000-00000000000a' and status in ('new','contacted','follow_up') and interest_level='hot')))$q$::text,'true');
select scr.eq('K02','manager A','the team overview lists ONLY ACTIVE branch A employees + the unassigned row (no branch B employee, no deactivated employee)','select string_agg(coalesce(employee_name,''-''), '','' order by employee_name) from public.get_sales_team_overview()','RS Sales A,SC Sales A2,Unassigned (manager inbox)'::text);
:done
:act_mgrA
select scr.eq('K03','manager A','per-employee row of sales A equals independent counts (active / overdue leads / interactions in period)',
 $q$select (select concat_ws('/',active_leads,overdue_leads,interactions_in_period) from public.get_sales_team_overview() where employee_id='00000000-0000-0000-0000-0000000000a4')
    = (select concat_ws('/',
        (select count(*) from public.leads where assigned_to='00000000-0000-0000-0000-0000000000a4' and status in ('new','contacted','follow_up')),
        (select count(*) from public.leads l where l.assigned_to='00000000-0000-0000-0000-0000000000a4' and l.status in ('new','contacted','follow_up') and exists (select 1 from public.lead_followups f where f.lead_id=l.id and f.status='pending' and f.due_at < now())),
        (select count(*) from public.lead_activities where actor_id='00000000-0000-0000-0000-0000000000a4' and kind in ('call','whatsapp','visit') and (occurred_at at time zone 'Africa/Cairo')::date between date_trunc('month',(now() at time zone 'Africa/Cairo')::date)::date and (now() at time zone 'Africa/Cairo')::date)))$q$::text,'true');
select scr.t('K04','manager A','ask for branch B','select * from public.get_sales_team_summary(''bbbbbbbb-0000-0000-0000-00000000000b'')','^DENIED 42501 Not authorized for this branch');
select scr.t('K04b','manager A','overview / attention lists for branch B','select * from public.get_sales_team_overview(''bbbbbbbb-0000-0000-0000-00000000000b'')','^DENIED 42501');
select scr.t('K04c','manager A','attention list for branch B','select * from public.get_attention_leads(''overdue'',''bbbbbbbb-0000-0000-0000-00000000000b'')','^DENIED 42501');
select scr.t('K05','manager A','explicit own branch is fine','select * from public.get_sales_team_summary(''aaaaaaaa-0000-0000-0000-00000000000a'')','^ALLOWED rows=1$');
select scr.t('K06','manager A','unknown attention list','select * from public.get_attention_leads(''everything'')','^DENIED 22023');
select scr.eq('K07','manager A','attention lists = independent sets: overdue / no_next_action / unassigned sizes',
 $q$select (select concat_ws('/',(select count(*) from public.get_attention_leads('overdue')),(select count(*) from public.get_attention_leads('no_next_action')),(select count(*) from public.get_attention_leads('unassigned'))))
    = (select concat_ws('/',
        (select count(*) from public.leads l where l.branch_id='aaaaaaaa-0000-0000-0000-00000000000a' and l.status in ('new','contacted','follow_up') and exists (select 1 from public.lead_followups f where f.lead_id=l.id and f.status='pending' and f.due_at < now())),
        (select count(*) from public.leads l where l.branch_id='aaaaaaaa-0000-0000-0000-00000000000a' and l.status in ('new','contacted','follow_up') and not exists (select 1 from public.lead_followups f where f.lead_id=l.id and f.status='pending')),
        (select count(*) from public.leads where branch_id='aaaaaaaa-0000-0000-0000-00000000000a' and status in ('new','contacted','follow_up') and assigned_to is null)))$q$::text,'true');
select scr.eq('K08','manager A','filter by employee: the overdue list of sales A2 holds only A2 leads','select (count(*) filter (where assigned_to <> ''00000000-0000-0000-0000-0000000000c2''))::text from public.get_attention_leads(''overdue'', null, ''00000000-0000-0000-0000-0000000000c2'')','0');
:done
:act_mgrB
select scr.eq('K09','manager B','sees only branch B: employees and leads','select (select string_agg(coalesce(employee_name,''-''), '','' order by employee_name) from public.get_sales_team_overview())||''/''||(select count(*) filter (where branch_id=''aaaaaaaa-0000-0000-0000-00000000000a'') from public.get_attention_leads(''no_next_action''))','SC Sales B,Unassigned (manager inbox)/0');
:done
:act_super
select scr.eq('K10','super admin (no branch)','NULL = every branch: the 3 ACTIVE sales employees of both branches','select (count(distinct employee_id) filter (where employee_id is not null))::text from public.get_sales_team_overview()','3');
select scr.eq('K11','super admin','one branch only when asked','select (count(distinct branch_id))::text from public.get_sales_team_overview(''bbbbbbbb-0000-0000-0000-00000000000b'')','1');
:done
-- refusals
:act_salesA
select scr.t('K12','sales A','team summary / overview / attention list','select * from public.get_sales_team_summary()','^DENIED 42501 Only a branch manager or Super Admin');
select scr.t('K12b','sales A','overview','select * from public.get_sales_team_overview()','^DENIED 42501');
select scr.t('K12c','sales A','attention list','select * from public.get_attention_leads(''overdue'')','^DENIED 42501');
:done
:act_salesB
select scr.t('K13','sales B','team dashboard','select * from public.get_sales_team_summary()','^DENIED 42501');
:done
:act_recepA
select scr.t('K14','reception A','team dashboard','select * from public.get_sales_team_summary()','^DENIED 42501');
:done
:act_coachA
select scr.t('K15','coach A','team dashboard','select * from public.get_attention_leads(''overdue'')','^DENIED 42501');
:done
:act_anon
select scr.t('K16','anon','team dashboard','select * from public.get_sales_team_summary()','^DENIED 42501');
:done
-- conversion-rate definition and Cairo day boundaries (superuser fixtures)
select scr.su($s$update public.leads set status='lost', lost_reason='other', lost_at = timestamptz '2026-12-01 00:30:00+02' where full_name in ('other2','other3')$s$);
select scr.su($s$update public.leads set created_at = timestamptz '2026-11-30 22:30:00+00' where full_name='other4'$s$);
select scr.su($s$update public.leads set created_at = timestamptz '2026-11-30 21:59:59+00' where full_name='other3'$s$);
:act_mgrA
select scr.eq('K17','manager A','conversion rate (decided): 0 converted / (0 converted + 2 lost) = 0.0000; cohort rate 0.0000 or NULL by creations','select (select conversion_rate_decided::text||''/''||lost_in_period||''/''||converted_in_period from public.get_sales_team_summary(null, date ''2026-12-01'', date ''2026-12-01''))','0.0000/2/0');
select scr.eq('K18','manager A','nothing decided in another period -> the rate is NULL, not 0','select coalesce((select conversion_rate_decided::text from public.get_sales_team_summary(null, date ''2026-10-01'', date ''2026-10-02'')),''NULL'')','NULL');
select scr.eq('K19','manager A','Cairo day boundary: a lead created 00:30 Cairo on 1 Dec counts on 1 Dec, the one created 23:59:59 Cairo on 30 Nov counts on 30 Nov','select (select new_in_period from public.get_sales_team_summary(null, date ''2026-12-01'', date ''2026-12-01''))||''/''||(select new_in_period from public.get_sales_team_summary(null, date ''2026-11-30'', date ''2026-11-30''))','1/1');
:done
select scr.eq('K20','catalog','dashboard functions: SECURITY DEFINER, STABLE (read-only), empty search_path, owner postgres, no anon/PUBLIC execute',$q$select count(*)::text from pg_proc p where pronamespace='public'::regnamespace and proname in ('get_sales_team_overview','get_sales_team_summary','get_attention_leads') and (not p.prosecdef or p.provolatile<>'s' or not ('search_path=""' = any(p.proconfig)) or pg_get_userbyid(p.proowner)<>'postgres' or has_function_privilege('anon',p.oid,'execute') or has_function_privilege('public',p.oid,'execute'))$q$,'0');
