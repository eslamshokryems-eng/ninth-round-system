-- LOCAL ONLY. Behaviour AFTER supabase/rollback/sales_workspace_rollback_behavioral.sql, run on a database where Release B has been USED
-- (activity and ownership history exist). Expectation: Release A behaviour for every user, every history row kept, history still append-only.
\set QUIET on
\pset tuples_only on
\pset format unaligned
\set ON_ERROR_STOP off
\set act_mgrA   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a2"}'',false); set role authenticated;'
\set act_salesA 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a4"}'',false); set role authenticated;'
\set act_salesB 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c4"}'',false); set role authenticated;'
\set done 'reset role;'

select scr.eq('R01','postgres(read)','every history row written under Release B is still there (activities / assignments)',
  $q$select (select count(*) from public.lead_activities)||'/'||(select count(*) from public.lead_assignments)$q$, (select v from scr.ctx where k='hist_before'));
select scr.eq('R02','catalog','Release B tables, columns and functions still exist (nothing dropped)',
  $q$select (select count(*) from pg_class where relname in ('lead_activities','lead_assignments') and relnamespace='public'::regnamespace)||'/'||
            (select count(*) from information_schema.columns where table_schema='public' and ((table_name='leads' and column_name in ('interest_level','last_contacted_at')) or (table_name='lead_followups' and column_name in ('kind','outcome'))))||'/'||
            (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('log_lead_interaction','assign_leads','get_my_worklist'))$q$, '2/4/3');
select scr.eq('R03','catalog','triggers: Release B insert rule + last_contacted guard DISABLED; history recorder and history guards ENABLED; Production trigger untouched',
  $q$select string_agg(tgname||'='||tgenabled, ',' order by tgname) from pg_trigger where not tgisinternal and tgname in ('trg_enforce_lead_insert_rules','trg_guard_lead_last_contacted','trg_record_lead_assignment_ins','trg_record_lead_assignment_upd','trg_guard_lead_activities','trg_guard_lead_assignments','trg_enforce_lead_assignment_rules')$q$,
  'trg_enforce_lead_assignment_rules=O,trg_enforce_lead_insert_rules=D,trg_guard_lead_activities=O,trg_guard_lead_assignments=O,trg_guard_lead_last_contacted=D,trg_record_lead_assignment_ins=O,trg_record_lead_assignment_upd=O');

:act_salesA
select scr.val('R04','sales A','Release A visibility is back: own leads + the branch''s unassigned pool (computed independently as the expected set)',
  'select (select count(*) from public.leads)::text', (select v from scr.ctx where k='expect_salesA'));
select scr.t('R05','sales A','the Release B RPCs are no longer callable (EXECUTE revoked)', 'select public.log_lead_interaction(scr.id(''own1''),''call'',''no_answer'',''x'',''call'',now() + interval ''1 day'')', '^DENIED 42501 permission denied for function');
select scr.t('R06','sales A','get_my_worklist no longer callable', 'select * from public.get_my_worklist()', '^DENIED 42501 permission denied for function');
select scr.t('R07','sales A','claim an unassigned lead again (Release A + Production trigger behaviour)', 'update public.leads set assigned_to=''00000000-0000-0000-0000-0000000000a4'' where full_name=''pool3''', '^ALLOWED rows=1$');
select scr.t('R08','sales A','reassign own lead to a colleague: still refused by the Production trigger', 'update public.leads set assigned_to=''00000000-0000-0000-0000-0000000000c2'' where full_name=''own5''', '^DENIED P0001 Only a branch manager');
select scr.t('R09','sales A','direct UPDATE of last_contacted_at: allowed again (guard disabled; the A-era frontend never writes this column)', 'update public.leads set last_contacted_at=now() where full_name=''own5''', '^ALLOWED rows=1$');
select scr.t('R10','sales A','the A-era follow-up flow (direct INSERT of a follow-up on own lead) works', 'insert into public.lead_followups(lead_id,branch_id,due_at,status,created_by) values (scr.id(''own5''),''aaaaaaaa-0000-0000-0000-00000000000a'',now()+interval ''1 day'',''pending'',''00000000-0000-0000-0000-0000000000a4'')', '^ALLOWED rows=1$');
select scr.t('R11','sales A','history is still append-only for users', 'delete from public.lead_activities', '^DENIED 42501 permission denied');
:done
:act_salesA
update public.leads set assigned_to='00000000-0000-0000-0000-0000000000a4' where full_name='pool3';
:done
select scr.eq('R12','postgres(read)','an owner change made after the rollback (A-era claim) is still recorded in the ownership history',
  $q$select count(*)::text from public.lead_assignments where lead_id=(select id from public.leads where full_name='pool3') and to_owner='00000000-0000-0000-0000-0000000000a4'$q$, '1');
select scr.tsu('R13','postgres (trusted)','history still cannot be changed even by the owner role', 'update public.lead_activities set note=''edited'' where true', '^BLOCKED-BY-GUARD 42501');
:act_mgrA
select scr.val('R14','manager A','manager visibility unchanged: whole branch A, nothing of branch B', 'select (select count(*) from public.leads where branch_id=''bbbbbbbb-0000-0000-0000-00000000000b'')::text||''/''||(select (count(*) > 0)::text from public.leads)', '0/true');
select scr.val('R15','manager A','managers can still read the kept history of their branch (lead page "History" of the next release)', 'select (count(*) > 0)::text from public.lead_activities', 'true');
:done
:act_salesB
select scr.val('R16','sales B','branch isolation kept: no branch A lead visible', 'select count(*)::text from public.leads where branch_id=''aaaaaaaa-0000-0000-0000-00000000000a''', '0');
:done
\echo ===== RESULTS =====
select format('%-5s %-4s | %-30s | %-100s | exp: %s | act: %s', id, case when pass then 'PASS' else 'FAIL' end, left(who,30), left(what,100), expected, actual) from scr.res where id like 'R%' order by ord;
