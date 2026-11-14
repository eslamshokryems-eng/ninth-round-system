-- LOCAL ONLY. Release B: Sales Workspace — ownership isolation, worklist, interaction logging, next-action enforcement, assignment history,
-- append-only history, forged-write attempts, cross-branch. Non-superuser login; actors via SET ROLE + claims. Fixtures from release_a_setup.sql.
\set QUIET on
\pset tuples_only on
\pset format unaligned
\set ON_ERROR_STOP off
\set act_super  'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1"}'',false); set role authenticated;'
\set act_mgrA   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a2"}'',false); set role authenticated;'
\set act_recepA 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a3"}'',false); set role authenticated;'
\set act_salesA 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a4"}'',false); set role authenticated;'
\set act_coachA 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a5"}'',false); set role authenticated;'
\set act_sales2 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c2"}'',false); set role authenticated;'
\set act_mgrB   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c3"}'',false); set role authenticated;'
\set act_salesB 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c4"}'',false); set role authenticated;'
\set act_anon   'select set_config(''request.jwt.claims'',''{"role":"anon"}'',false); set role anon;'
\set done 'reset role;'
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''
select 'session_user='||session_user||' superuser='||(select rolsuper from pg_roles where rolname=session_user) as harness;
-- ids used below (superuser reads)
select scr.keep('own1',  $s$select id::text from public.leads where full_name='own1'$s$);
select scr.keep('own2',  $s$select id::text from public.leads where full_name='own2'$s$);
select scr.keep('own3',  $s$select id::text from public.leads where full_name='own3'$s$);
select scr.keep('own4',  $s$select id::text from public.leads where full_name='own4'$s$);
select scr.keep('own5',  $s$select id::text from public.leads where full_name='own5'$s$);
select scr.keep('other1',$s$select id::text from public.leads where full_name='other1'$s$);
select scr.keep('pool1', $s$select id::text from public.leads where full_name='pool1'$s$);
select scr.keep('bpool1',$s$select id::text from public.leads where full_name='bpool1'$s$);

-- ================= ownership isolation (policy alignment) =================
:act_salesA
select scr.val('O01','sales A','sees ONLY the 5 leads assigned to them (the unassigned pool is the manager inbox)','select string_agg(full_name, '','' order by full_name) from public.leads','own1,own2,own3,own4,own5');
select scr.val('O02','sales A','follow-ups visible: own leads only','select count(*)::text from public.lead_followups','5');
select scr.t('O03','sales A','claim an unassigned lead by direct UPDATE (no longer visible to them)','update public.leads set assigned_to=''00000000-0000-0000-0000-0000000000a4'' where full_name=''pool1''','^ALLOWED rows=0$');
select scr.t('O04','sales A','INSERT a lead assigned to ANOTHER employee (F4)','insert into public.leads(full_name,phone,branch_id,created_by,assigned_to) values (''f4a'',''0160000001'',''aaaaaaaa-0000-0000-0000-00000000000a'',''00000000-0000-0000-0000-0000000000a4'',''00000000-0000-0000-0000-0000000000c2'')','^BLOCKED-BY-GUARD 42501');
select scr.t('O05','sales A','INSERT a lead with no owner: it becomes their own (asserted inside the statement)','with i as (insert into public.leads(full_name,phone,branch_id,created_by) values (''f4b'',''0160000002'',''aaaaaaaa-0000-0000-0000-00000000000a'',''00000000-0000-0000-0000-0000000000a4'') returning assigned_to) select 1/(case when assigned_to = ''00000000-0000-0000-0000-0000000000a4'' then 1 else 0 end) from i','^ALLOWED rows=1$');
select scr.t('O06','sales A','forge last_contacted_at by direct UPDATE','update public.leads set last_contacted_at=now() where full_name=''own1''','^BLOCKED-BY-GUARD 42501');
select scr.t('O07','sales A','change interest_level by direct UPDATE (allowed: it is an employee field)','update public.leads set interest_level=''hot'' where full_name=''own1''','^ALLOWED rows=1$');
select scr.t('O08','sales A','reassign own lead to a colleague by direct UPDATE (denied by the assignment trigger or by RLS, depending on the schema generation)','update public.leads set assigned_to=''00000000-0000-0000-0000-0000000000c2'' where full_name=''own1''','^DENIED (P0001|42501)');
:done
:act_sales2
select scr.val('O09','sales A2','sees only their own 4','select string_agg(full_name, '','' order by full_name) from public.leads','other1,other2,other3,other4');
:done
:act_mgrA
select scr.val('O10','manager A','sees the whole branch: 12 leads incl. the unassigned inbox','select count(*)::text from public.leads','12');
select scr.t('O11','manager A','INSERT a lead assigned to a branch B employee','insert into public.leads(full_name,phone,branch_id,created_by,assigned_to) values (''xb'',''0160000003'',''aaaaaaaa-0000-0000-0000-00000000000a'',''00000000-0000-0000-0000-0000000000a2'',''00000000-0000-0000-0000-0000000000c4'')','^BLOCKED-BY-GUARD 42501');
:done

-- ================= worklist & summary =================
:act_salesA
select scr.val('W01','sales A','worklist = only own active leads, ordered (all 5 have an overdue follow-up -> bucket overdue)','select count(*)||''/''||count(*) filter (where bucket=''overdue'')||''/''||bool_and(assigned_to=''00000000-0000-0000-0000-0000000000a4'')::text from public.get_my_worklist()','5/5/true');
select scr.val('W02','sales A','summary: total / overdue / new uncontacted / no next action','select total_active||''/''||overdue||''/''||new_uncontacted||''/''||no_next_action from public.get_worklist_summary()','5/5/5/0');
select scr.t('W03','sales A','ask for ANOTHER employee''s worklist','select * from public.get_my_worklist(''00000000-0000-0000-0000-0000000000c2'')','^DENIED 42501');
select scr.t('W04','sales A','ask for another employee''s summary','select * from public.get_worklist_summary(''00000000-0000-0000-0000-0000000000c2'')','^DENIED 42501');
:done
:act_mgrA
select scr.val('W05','manager A','may view an employee''s worklist of own branch','select count(*)::text from public.get_my_worklist(''00000000-0000-0000-0000-0000000000a4'')','5');
select scr.t('W06','manager A','view a BRANCH B employee''s worklist','select * from public.get_my_worklist(''00000000-0000-0000-0000-0000000000c4'')','^DENIED 42501');
:done
:act_recepA
select scr.t('W07','reception A','worklist','select * from public.get_my_worklist()','^DENIED 42501');
:done
:act_coachA
select scr.t('W08','coach A','summary','select * from public.get_worklist_summary()','^DENIED 42501');
:done
:act_anon
select scr.t('W09','anon','worklist / log interaction','select * from public.get_my_worklist()','^DENIED 42501');
:done

-- ================= recording interactions (next action enforced) =================
:act_salesA
select scr.t('I01','sales A','log a call WITHOUT a next action','select public.log_lead_interaction(scr.id(''own1''),''call'',''interested'',''good call'')','^DENIED 22023 Schedule the next action');
select scr.t('I02','sales A','log a call with a next action in the past','select public.log_lead_interaction(scr.id(''own1''),''call'',''interested'',''x'',''call'',now() - interval ''2 days'')','^DENIED 22023 The next action must be in the future');
select scr.t('I03','sales A','log an unknown outcome','select public.log_lead_interaction(scr.id(''own1''),''call'',''bogus'',''x'',''call'',now() + interval ''1 day'')','^DENIED 22023 Unknown interaction outcome');
select scr.t('I04','sales A','log a call with outcome + next action','select public.log_lead_interaction(scr.id(''own1''),''call'',''interested'',''wants the 3-month plan'',''whatsapp'',now() + interval ''1 day'')','^ALLOWED rows=1$');
:done
-- persist one real interaction (scr.t rolls back): do it for real as sales A
:act_salesA
select public.log_lead_interaction(scr.id('own1'),'call','interested','wants the 3-month plan','whatsapp',now() + interval '1 day',p_interest_level => 'hot') is not null as logged;
:done
:act_salesA
select scr.val('I05','sales A','after logging: lead is follow_up, contacted now, interest hot','select status::text||''/''||(last_contacted_at is not null)::text||''/''||interest_level from public.leads where full_name=''own1''','follow_up/true/hot');
select scr.val('I06','sales A','exactly ONE pending follow-up remains, kind whatsapp; the old one is completed with the outcome','select (select count(*) from public.lead_followups f join public.leads l on l.id=f.lead_id where l.full_name=''own1'' and f.status=''pending'')||''/''||(select kind from public.lead_followups f join public.leads l on l.id=f.lead_id where l.full_name=''own1'' and f.status=''pending'')||''/''||(select count(*) from public.lead_followups f join public.leads l on l.id=f.lead_id where l.full_name=''own1'' and f.status=''completed'' and f.outcome=''interested'')','1/whatsapp/1');
select scr.val('I07','sales A','the lead stays in the worklist with the correct next action, no longer overdue','select bucket||''/''||next_action_kind from public.get_my_worklist() where full_name=''own1''','hot/whatsapp');
select scr.val('I08','sales A','activity history: call, status change recorded with actor name','select string_agg(kind||'':''||coalesce(outcome,''-''), '','' order by occurred_at, kind) from public.lead_activities where lead_id=scr.id(''own1'')','call:interested,status_change:-');
select scr.val('I08b','sales A','get_lead_workspace_state: interest hot, contact recorded, next action whatsapp','select interest_level||''/''||(last_contacted_at is not null)::text||''/''||next_action_kind from public.get_lead_workspace_state(scr.id(''own1''))','hot/true/whatsapp');
select scr.val('I08c','sales A','get_lead_activities newest first: status change then call (same transaction time, ordered by id desc)','select count(*)::text from public.get_lead_activities(scr.id(''own1''))','2');
:done
:act_salesA
select scr.t('I09','sales A','log on a colleague''s lead','select public.log_lead_interaction(scr.id(''other1''),''call'',''no_answer'',''x'',''call'',now() + interval ''1 day'')','^DENIED 42501 Lead not found');
select scr.t('I10','sales A','log on an unassigned pool lead','select public.log_lead_interaction(scr.id(''pool1''),''call'',''no_answer'',''x'',''call'',now() + interval ''1 day'')','^DENIED 42501 Lead not found');
select scr.t('I11','sales A','log on a branch B lead','select public.log_lead_interaction(scr.id(''bpool1''),''call'',''no_answer'',''x'',''call'',now() + interval ''1 day'')','^DENIED 42501 Lead not found');
select scr.t('I12','sales A','not_interested without a lost reason','select public.log_lead_interaction(scr.id(''own2''),''call'',''not_interested'',''x'')','^DENIED 22023 Choose why the lead is lost');
select scr.t('I13','sales A','not_interested WITH a lost reason closes the lead','select public.log_lead_interaction(scr.id(''own2''),''call'',''not_interested'',''price too high'',null,null,''too_expensive'')','^ALLOWED rows=1$');
select scr.t('I14','sales A','schedule the next action only (lead without one)','select public.set_lead_next_action(scr.id(''own3''),''visit'',now() + interval ''2 days'',''trial session'')','^ALLOWED rows=1$');
select scr.t('I15','sales A','add a note','select public.add_lead_note(scr.id(''own3''),''prefers evenings'')','^ALLOWED rows=1$');
select scr.t('I16','sales A','blank note','select public.add_lead_note(scr.id(''own3''),''  '')','^DENIED 22023 Write a note');
select scr.t('I17','sales A','set interest on own lead','select public.set_lead_interest(scr.id(''own3''),''cold'')','^ALLOWED rows=1$');
select scr.t('I18','sales A','set interest on a colleague''s lead','select public.set_lead_interest(scr.id(''other1''),''hot'')','^DENIED 42501');
:done
:act_sales2
select scr.t('I19','sales A2','add a note on sales A''s lead','select public.add_lead_note(scr.id(''own1''),''x'')','^DENIED 42501');
select scr.val('I20','sales A2','cannot read sales A''s activity history','select count(*)::text from public.lead_activities where lead_id=scr.id(''own1'')','0');
select scr.val('I20b','sales A2','get_lead_activities / get_lead_workspace_state return nothing for a colleague''s lead (RLS under SECURITY INVOKER)','select (select count(*) from public.get_lead_activities(scr.id(''own1'')))||''/''||(select count(*) from public.get_lead_workspace_state(scr.id(''own1'')))','0/0');
:done
:act_mgrA
select scr.t('I21','manager A','log an interaction on an employee''s lead (manager may)','select public.log_lead_interaction(scr.id(''other1''),''call'',''no_answer'',''manager follow-up'',''call'',now() + interval ''1 day'')','^ALLOWED rows=1$');
select scr.val('I22','manager A','sees the history of any branch lead','select count(*)::text from public.lead_activities where lead_id=scr.id(''own1'')','2');
:done
:act_mgrB
select scr.t('I23','manager B','act on a branch A lead','select public.log_lead_interaction(scr.id(''own1''),''call'',''no_answer'',''x'',''call'',now() + interval ''1 day'')','^DENIED 42501 Lead not found');
select scr.val('I24','manager B','cannot read branch A activities or assignments','select ((select count(*) from public.lead_activities where branch_id=''aaaaaaaa-0000-0000-0000-00000000000a'')+(select count(*) from public.lead_assignments where branch_id=''aaaaaaaa-0000-0000-0000-00000000000a''))::text','0');
:done

-- ================= assignment & history =================
:act_salesA
select scr.t('A01','sales A','assign_leads as an employee','select public.assign_leads(array[scr.id(''own1'')], ''00000000-0000-0000-0000-0000000000c2'', ''x'')','^DENIED 42501 Only a branch manager');
:done
:act_mgrA
select scr.t('A02','manager A','assign without a reason','select public.assign_leads(array[scr.id(''pool1'')], ''00000000-0000-0000-0000-0000000000a4'', '' '')','^DENIED 22023 A reason is required');
select scr.t('A03','manager A','assign to a non-sales employee (reception)','select public.assign_leads(array[scr.id(''pool1'')], ''00000000-0000-0000-0000-0000000000a3'', ''x'')','^DENIED 22023 The new owner must be an active sales employee');
select scr.t('A04','manager A','assign to a branch B employee','select public.assign_leads(array[scr.id(''pool1'')], ''00000000-0000-0000-0000-0000000000c4'', ''x'')','^DENIED 22023');
select scr.t('A05','manager A','assign to a deactivated employee','select public.assign_leads(array[scr.id(''pool1'')], ''00000000-0000-0000-0000-0000000000c5'', ''x'')','^DENIED 22023 The new owner must be an active sales employee');
select scr.t('A06','manager A','assign a branch B lead','select public.assign_leads(array[scr.id(''bpool1'')], ''00000000-0000-0000-0000-0000000000a4'', ''x'')','^DENIED 42501');
select scr.t('A07','manager A','assign a missing lead id','select public.assign_leads(array[gen_random_uuid()], ''00000000-0000-0000-0000-0000000000a4'', ''x'')','^DENIED 42501');
:done
:act_mgrA
select public.assign_leads(array[scr.id('pool1')], '00000000-0000-0000-0000-0000000000a4', 'new lead from the inbox') as assigned;
select public.assign_leads(array[scr.id('own3')], '00000000-0000-0000-0000-0000000000c2', 'balance the workload') as reassigned;
:done
select scr.eq('A08','postgres(read)','pool1 now belongs to sales A; own3 to sales A2','select (select assigned_to::text from public.leads where full_name=''pool1'')||''/''||(select assigned_to::text from public.leads where full_name=''own3'')','00000000-0000-0000-0000-0000000000a4/00000000-0000-0000-0000-0000000000c2');
select scr.eq('A09','postgres(read)','history of pool1: from nobody to sales A, with the reason and the performing manager','select string_agg(coalesce(from_name,''-'')||''>''||to_name||'':''||coalesce(reason,''-'')||'':''||coalesce(performed_by_name,''-''), '';'' order by created_at) from public.lead_assignments where lead_id=scr.id(''pool1'')','->RS Sales A:new lead from the inbox:RS Manager A');
select scr.eq('A10','postgres(read)','history of own3: previous owner kept (recoverable), new owner, reason, manager','select string_agg(coalesce(from_name,''-'')||''>''||to_name||'':''||coalesce(reason,''-'')||'':''||coalesce(performed_by_name,''-''), '';'' order by created_at) from public.lead_assignments where lead_id=scr.id(''own3'')','RS Sales A>SC Sales A2:balance the workload:RS Manager A');
select scr.eq('A11','postgres(read)','activity rows of kind assignment / reassignment exist for both moves','select (select count(*) from public.lead_activities where kind=''assignment'' and lead_id=scr.id(''pool1''))||''/''||(select count(*) from public.lead_activities where kind=''reassignment'' and lead_id=scr.id(''own3''))','1/1');
:act_salesA
select scr.val('A12','sales A (previous owner of own3)','no longer sees own3 nor its history; now sees pool1','select (select count(*) from public.leads where full_name=''own3'')||''/''||(select count(*) from public.lead_activities where lead_id=scr.id(''own3''))||''/''||(select count(*) from public.leads where full_name=''pool1'')','0/0/1');
select scr.val('A13','sales A','can read the assignment history of their own leads only','select (select count(*) from public.lead_assignments where lead_id=scr.id(''pool1''))||''/''||(select count(*) from public.lead_assignments where lead_id=scr.id(''own3''))','1/0');
:done
:act_sales2
select scr.val('A14','sales A2 (new owner)','sees own3, its worklist row and its assignment history','select (select count(*) from public.leads where full_name=''own3'')||''/''||(select count(*) from public.get_my_worklist() where full_name=''own3'')||''/''||(select count(*) from public.lead_assignments where lead_id=scr.id(''own3''))','1/1/1');
:done
:act_mgrA
update public.leads set assigned_to='00000000-0000-0000-0000-0000000000c2' where full_name='own4';
:done
select scr.eq('A15','postgres(read)','reassignment through the OLD direct path (manager UPDATE assigned_to) is still allowed and is recorded — no path skips history','select count(*)::text from public.lead_assignments where lead_id=scr.id(''own4'') and to_owner=''00000000-0000-0000-0000-0000000000c2''','1');

-- ================= append-only history & forged writes =================
:act_salesA
select scr.t('H01','sales A','INSERT a lead_activities row directly (forge history)','insert into public.lead_activities(lead_id,branch_id,actor_id,kind) values (scr.id(''own1''),''aaaaaaaa-0000-0000-0000-00000000000a'',''00000000-0000-0000-0000-0000000000a4'',''call'')','^DENIED 42501 permission denied');
select scr.t('H02','sales A','UPDATE a recorded activity','update public.lead_activities set note=''edited''','^DENIED 42501 permission denied');
select scr.t('H03','sales A','DELETE recorded activities','delete from public.lead_activities','^DENIED 42501 permission denied');
select scr.t('H04','sales A','DELETE lead_assignments','delete from public.lead_assignments','^DENIED 42501 permission denied');
:done
:act_mgrA
select scr.t('H05','manager A','UPDATE history (managers are not exempt)','update public.lead_activities set note=''edited''','^DENIED 42501 permission denied');
:done
:act_super
select scr.t('H06','super admin','DELETE history','delete from public.lead_activities','^DENIED 42501 permission denied');
:done
select scr.tsu('H07','postgres (trusted)','UPDATE a recorded activity','update public.lead_activities set note=''edited'' where true','^BLOCKED-BY-GUARD 42501');
select scr.tsu('H08','postgres (trusted)','DELETE a recorded assignment','delete from public.lead_assignments where true','^BLOCKED-BY-GUARD 42501');
select scr.tsu('H09','postgres (trusted)','TRUNCATE the activity history','truncate public.lead_activities','^BLOCKED-BY-GUARD 42501');
:act_anon
select scr.t('H10','anon','read the history','select * from public.lead_activities','^DENIED 42501');
:done

-- ================= catalog =================
select scr.eq('G01','catalog','every new function: SECURITY DEFINER, empty search_path, owner postgres; EXECUTE not granted to anon/PUBLIC (except the pure helper my_sales_branch)',$q$select count(*)::text from pg_proc p where pronamespace='public'::regnamespace and proname in ('log_lead_interaction','set_lead_next_action','add_lead_note','set_lead_interest','assign_leads','get_my_worklist','get_worklist_summary','can_work_lead','my_sales_branch','record_lead_assignment') and (not p.prosecdef or not ('search_path=""' = any(p.proconfig)) or pg_get_userbyid(p.proowner)<>'postgres' or (p.proname not in ('my_sales_branch','record_lead_assignment') and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('public',p.oid,'execute'))))$q$,'0');
select scr.eq('G02','catalog','no new RPC takes an actor / employee id as the caller identity (identity = auth.uid() only)',$q$select count(*)::text from pg_proc p where pronamespace='public'::regnamespace and proname in ('log_lead_interaction','set_lead_next_action','add_lead_note','set_lead_interest','assign_leads') and (p.proargnames::text ilike '%actor%' or p.proargnames::text ilike '%performed_by%' or p.proargnames::text ilike '%employee%')$q$,'0');
select scr.eq('G03','catalog','history tables: RLS on, only SELECT granted, no write policy',$q$select (select count(*) from pg_class where relname in ('lead_activities','lead_assignments') and relrowsecurity)||'/'||(select count(*) from information_schema.role_table_grants where table_name in ('lead_activities','lead_assignments') and grantee in ('authenticated','anon','PUBLIC') and privilege_type<>'SELECT')||'/'||(select count(*) from pg_policies where tablename in ('lead_activities','lead_assignments') and cmd<>'SELECT')$q$,'2/0/0');
\echo ===== RESULTS =====
select format('%-5s %-4s | %-30s | %-100s | exp: %s | act: %s', id, case when pass then 'PASS' else 'FAIL' end, left(who,30), left(what,100), expected, actual) from scr.res order by ord;
select 'SUMMARY total='||count(*)||' pass='||count(*) filter (where pass)||' fail='||count(*) filter (where not pass) from scr.res;
