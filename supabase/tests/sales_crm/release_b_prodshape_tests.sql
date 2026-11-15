-- LOCAL ONLY. Release B on PRODUCTION'S REAL SHAPE: the trigger trg_enforce_lead_assignment_rules (present in Production, not in the
-- 527f705 migrations; recreated byte-for-byte by prodshape_lead_assignment_trigger.sql) together with the triggers and RPCs Release B adds.
-- Question answered: do the assignment rules conflict, duplicate inconsistently, or leave a path that skips the ownership history?
-- Runs after release_b_tests.sql (same fixtures and helpers). Non-superuser login; actors via SET ROLE + claims.
\set QUIET on
\pset tuples_only on
\pset format unaligned
\set ON_ERROR_STOP off
\set act_super  'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1"}'',false); set role authenticated;'
\set act_mgrA   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a2"}'',false); set role authenticated;'
\set act_salesA 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a4"}'',false); set role authenticated;'
\set act_sales2 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c2"}'',false); set role authenticated;'
\set act_mgrB   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c3"}'',false); set role authenticated;'
\set done 'reset role;'

select scr.keep('own5',  $s$select id::text from public.leads where full_name='own5'$s$);
select scr.keep('other2',$s$select id::text from public.leads where full_name='other2'$s$);
select scr.keep('pool2', $s$select id::text from public.leads where full_name='pool2'$s$);

-- ================= the Production trigger is really there, and the order of the BEFORE UPDATE triggers =================
select scr.eq('P00','catalog','Production trigger present with Production''s exact function body (md5) and definition',
  $q$select (select count(*) from pg_trigger where tgname='trg_enforce_lead_assignment_rules' and tgrelid='public.leads'::regclass and tgenabled='O')||'/'||
            (select left(md5(replace(prosrc, chr(13), '')), 8) from pg_proc where proname='enforce_lead_assignment_rules')$q$, '1/ab01bbd9');
select scr.eq('P01','catalog','BEFORE UPDATE row triggers on leads fire in name order: Production assignment rules first, then the Release B last_contacted guard',
  $q$select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid='public.leads'::regclass and not tgisinternal and tgtype & 2 = 2 and tgtype & 16 = 16 and tgname in ('trg_enforce_lead_assignment_rules','trg_guard_lead_last_contacted')$q$,
  'trg_enforce_lead_assignment_rules,trg_guard_lead_last_contacted');
select scr.eq('P02','catalog','Release B adds NO second assignment-rule trigger on UPDATE (no duplicate rule set): its leads triggers are insert rules, last_contacted guard and the history recorder',
  $q$select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid='public.leads'::regclass and not tgisinternal and tgname like 'trg_%' and tgname not in ('trg_enforce_lead_assignment_rules') and tgname not like '%updated_at%' and tgname not like 'trg_audit_%'$q$,
  'trg_enforce_lead_insert_rules,trg_guard_lead_last_contacted,trg_record_lead_assignment_ins,trg_record_lead_assignment_upd');

-- ================= employee: cannot move ownership, by any path =================
:act_salesA
select scr.t('P03','sales A','give own lead to a colleague by direct UPDATE: stopped by the PRODUCTION trigger (its own message)',
  'update public.leads set assigned_to=''00000000-0000-0000-0000-0000000000c2'' where full_name=''own5''', '^DENIED P0001 Only a branch manager or super admin can reassign a lead');
select scr.t('P04','sales A','unassign own lead (put it back in the pool) by direct UPDATE: stopped by the Production trigger',
  'update public.leads set assigned_to=null where full_name=''own5''', '^DENIED P0001 Only a branch manager or super admin can reassign a lead');
select scr.t('P05','sales A','"claim" an unassigned lead (the one path the Production trigger allows an employee): unreachable — the lead is not visible under Release B',
  'update public.leads set assigned_to=''00000000-0000-0000-0000-0000000000a4'' where full_name=''pool2''', '^ALLOWED rows=0$');
select scr.t('P06','sales A','assign_leads() as an employee: refused by the RPC before any trigger runs',
  'select public.assign_leads(array[scr.id(''own5'')], ''00000000-0000-0000-0000-0000000000c2'', ''x'')', '^DENIED 42501 Only a branch manager');
select scr.t('P07','sales A','edit own lead details (name/notes): the Production trigger does nothing when the owner does not change',
  'update public.leads set interest_notes=''prefers mornings'' where full_name=''own5''', '^ALLOWED rows=1$');
select scr.t('P08','sales A','create a lead for themselves: allowed (INSERT is not covered by the Production trigger; Release B''s insert rule keeps it own)',
  'insert into public.leads(full_name,phone,branch_id,created_by,assigned_to) values (''p08'',''0170000008'',''aaaaaaaa-0000-0000-0000-00000000000a'',''00000000-0000-0000-0000-0000000000a4'',''00000000-0000-0000-0000-0000000000a4'')', '^ALLOWED rows=1$');
:done

-- ================= manager: assign_leads passes the Production trigger; the trigger and the RPC agree =================
:act_mgrA
select scr.t('P09','manager A','assign_leads() an unassigned lead to an active employee of the branch: passes the RPC checks AND the Production trigger (caller role read from the JWT inside the SECURITY DEFINER RPC)',
  'select public.assign_leads(array[scr.id(''pool2'')], ''00000000-0000-0000-0000-0000000000a4'', ''p09 reason'')', '^ALLOWED rows=1$');
select scr.t('P10','manager A','assign_leads() to an employee of ANOTHER branch: refused by the RPC (22023) — the Production trigger would also refuse; both rules say the same',
  'select public.assign_leads(array[scr.id(''pool2'')], ''00000000-0000-0000-0000-0000000000c4'', ''x'')', '^DENIED 22023 The new owner belongs to a different branch');
select scr.t('P11','manager A','direct UPDATE to an employee of ANOTHER branch: refused by the Production trigger',
  'update public.leads set assigned_to=''00000000-0000-0000-0000-0000000000c4'' where full_name=''other2''', '^DENIED P0001 Cannot assign a lead to a staff member from a different branch');
select scr.t('P12','manager A','direct UPDATE to a RECEPTION user of the same branch: the Production trigger allows it (it checks branch only). Known, pre-existing gap of the direct path; the Release B UI never does this (it uses assign_leads, which requires an active sales employee); the change is still recorded (P16)',
  'update public.leads set assigned_to=''00000000-0000-0000-0000-0000000000a3'' where full_name=''other2''', '^ALLOWED rows=1$');
select scr.t('P13','manager A','direct UPDATE assigned_to = NULL (unassign): the Production trigger allows it for a manager (pre-existing); recorded in history',
  'update public.leads set assigned_to=null where full_name=''other2''', '^ALLOWED rows=1$');
:done
-- persist one RPC move (P09) and one direct move (manager, no RPC) to prove the history trigger records both with the Production trigger in front
:act_mgrA
select public.assign_leads(array[scr.id('pool2')], '00000000-0000-0000-0000-0000000000a4', 'p09 reason');
update public.leads set assigned_to='00000000-0000-0000-0000-0000000000a4' where full_name='other2';
:done
:act_mgrB
select scr.t('P14','manager B','assign a branch A lead (direct UPDATE): not visible -> 0 rows (branch isolation by RLS before any trigger)',
  'update public.leads set assigned_to=''00000000-0000-0000-0000-0000000000c4'' where full_name=''own5''', '^ALLOWED rows=0$');
select scr.t('P15','manager B','assign_leads() on a branch A lead', 'select public.assign_leads(array[scr.id(''own5'')], ''00000000-0000-0000-0000-0000000000c4'', ''x'')', '^DENIED 42501');
:done

-- ================= ownership history: every successful change recorded once, by whichever path =================
select scr.eq('P16','postgres(read)','pool2 (assign_leads): exactly 1 history row, from nobody to sales A, reason and manager recorded',
  $q$select string_agg(coalesce(from_name,'-')||'>'||coalesce(to_name,'-')||':'||coalesce(reason,'-')||':'||coalesce(performed_by_name,'-'), ';' order by created_at) from public.lead_assignments where lead_id=scr.id('pool2')$q$,
  '->RS Sales A:p09 reason:RS Manager A');
select scr.eq('P17','postgres(read)','other2 (direct UPDATE by the manager): recorded once, previous owner kept, reason empty (the direct path carries no reason)',
  $q$select count(*)||'/'||string_agg(coalesce(from_name,'-')||'>'||coalesce(to_name,'-')||':'||coalesce(reason,'-'), ';') from public.lead_assignments where lead_id=scr.id('other2')$q$,
  '1/SC Sales A2>RS Sales A:-');
select scr.eq('P18','postgres(read)','refused attempts (P03, P04, P10, P11) and rolled-back attempts (P12, P13) left NO history rows',
  $q$select count(*)::text from public.lead_assignments where lead_id in (scr.id('own5')) or (lead_id=scr.id('other2') and to_owner is distinct from '00000000-0000-0000-0000-0000000000a4')$q$, '0');
\echo
:act_salesA
insert into public.leads(full_name,phone,branch_id,created_by) values ('p19','0170000019','aaaaaaaa-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a4');
:done
select scr.keep('p19', $s$select id::text from public.leads where full_name='p19'$s$);
select scr.eq('P19','postgres(read)','a lead created by the employee (no owner given): owned by them, ONE history row (nobody -> sales A, performed by sales A)',
  $q$select (select assigned_to::text from public.leads where id=scr.id('p19'))||'/'||(select count(*)||':'||string_agg(coalesce(from_name,'-')||'>'||to_name||':'||performed_by_name, ';') from public.lead_assignments where lead_id=scr.id('p19'))$q$,
  '00000000-0000-0000-0000-0000000000a4/1:->RS Sales A:RS Sales A');

-- ================= isolation after the moves =================
:act_salesA
select scr.val('P20','sales A','now sees pool2 and other2 (assigned to them) and and p19; still none of the unassigned / colleague / branch B leads',
  'select (select count(*) from public.leads where full_name in (''pool2'',''other2'',''p19''))||''/''||(select count(*) from public.leads where assigned_to is distinct from ''00000000-0000-0000-0000-0000000000a4'')', '3/0');
:done
:act_sales2
select scr.val('P21','sales A2 (previous owner of other2)','no longer sees other2 nor its history','select (select count(*) from public.leads where full_name=''other2'')||''/''||(select count(*) from public.lead_activities where lead_id=scr.id(''other2''))', '0/0');
:done
:act_mgrA
select scr.val('P22','manager A','sees every branch A lead, including the remaining unassigned ones; none of branch B',
  'select (select count(*) from public.leads where assigned_to is null)||''/''||(select count(*) from public.leads where branch_id=''bbbbbbbb-0000-0000-0000-00000000000b'')', '1/0');
:done
:act_super
select scr.val('P23','super admin','sees both branches including branch B''s unassigned leads','select (select count(*) from public.leads where branch_id=''bbbbbbbb-0000-0000-0000-00000000000b'')::text', '3');
:done
\echo ===== RESULTS =====
select format('%-5s %-4s | %-30s | %-100s | exp: %s | act: %s', id, case when pass then 'PASS' else 'FAIL' end, left(who,30), left(what,100), expected, actual) from scr.res where id like 'P%' order by ord;
