-- LOCAL ONLY. Release A: behaviour of can_manage_leads()/leads/lead_followups RLS. Run BEFORE and AFTER the migration; results must be IDENTICAL
-- (except the catalog rows, which are expected to differ by design). Non-superuser login role; actors via SET ROLE + claims.
\set QUIET on
\pset tuples_only on
\pset format unaligned
\set ON_ERROR_STOP off
\set act_super  'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a1"}'',false); set role authenticated;'
\set act_mgrA   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a2"}'',false); set role authenticated;'
\set act_recepA 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a3"}'',false); set role authenticated;'
\set act_salesA 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a4"}'',false); set role authenticated;'
\set act_coachA 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a5"}'',false); set role authenticated;'
\set act_cust   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000a7"}'',false); set role authenticated;'
\set act_sales2 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c2"}'',false); set role authenticated;'
\set act_mgrB   'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c3"}'',false); set role authenticated;'
\set act_salesB 'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c4"}'',false); set role authenticated;'
\set act_inact  'select set_config(''request.jwt.claims'',''{"role":"authenticated","sub":"00000000-0000-0000-0000-0000000000c5"}'',false); set role authenticated;'
\set act_anon   'select set_config(''request.jwt.claims'',''{"role":"anon"}'',false); set role anon;'
\set act_nouid  'select set_config(''request.jwt.claims'','''',false); set role authenticated;'
\set done 'reset role;'
\set A '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set B '''bbbbbbbb-0000-0000-0000-00000000000b'''
select 'session_user='||session_user||' superuser='||(select rolsuper from pg_roles where rolname=session_user) as harness;
-- helpers (created by the runner as superuser): scr.t(id, who, what, sql, expect_regex), scr.rows(sql)->text
:act_salesA
select scr.t('L01','sales A','list leads: sees OWN leads and the UNASSIGNED pool of branch A, nothing else','select id from public.leads','^ALLOWED rows=8$');
select scr.val('L01b','sales A','ids visible = 5 own + 3 unassigned (names)','select string_agg(full_name, '','' order by full_name) from public.leads','own1,own2,own3,own4,own5,pool1,pool2,pool3');
select scr.val('L02','sales A','sees none of employee A2''s leads','select count(*)::text from public.leads where full_name like ''other%''','0');
select scr.val('L03','sales A','sees no branch B lead','select count(*)::text from public.leads where branch_id=''bbbbbbbb-0000-0000-0000-00000000000b''','0');
select scr.val('L04','sales A','follow-ups: only those of OWN leads (current policy: the unassigned pool has no follow-up visibility)','select count(*)::text from public.lead_followups','5');
select scr.val('L04b','sales A','overdue list = pending & due in the past, own leads only','select count(*)::text from public.lead_followups where status=''pending'' and due_at < now()','5');
select scr.val('L05','sales A','dashboard counts: total / new today','select (select count(*) from public.leads)||''/''||(select count(*) from public.leads where created_at >= date_trunc(''day'', now()))','8/8');
select scr.t('L06','sales A','insert a lead in own branch as self','insert into public.leads(full_name,phone,branch_id,created_by,assigned_to) values (''ins1'',''0100000001'',''aaaaaaaa-0000-0000-0000-00000000000a'',''00000000-0000-0000-0000-0000000000a4'',''00000000-0000-0000-0000-0000000000a4'')','^ALLOWED rows=1$');
select scr.t('L07','sales A','insert a lead in branch B','insert into public.leads(full_name,phone,branch_id,created_by) values (''insB'',''0100000002'',''bbbbbbbb-0000-0000-0000-00000000000b'',''00000000-0000-0000-0000-0000000000a4'')','^DENIED 42501');
select scr.t('L08','sales A','update own lead','update public.leads set interest_notes=''x'' where full_name=''own1''','^ALLOWED rows=1$');
select scr.t('L09','sales A','update employee A2''s lead','update public.leads set interest_notes=''x'' where full_name=''other1''','^ALLOWED rows=0$');
select scr.t('L10','sales A','delete any lead (no delete policy)','delete from public.leads where full_name=''own2''','^(ALLOWED rows=0|DENIED 42501)');
select scr.val('F01','sales A','can_manage_leads: own branch / other branch / random / NULL','select can_manage_leads(''aaaaaaaa-0000-0000-0000-00000000000a'')::text||''/''||can_manage_leads(''bbbbbbbb-0000-0000-0000-00000000000b'')::text||''/''||can_manage_leads(gen_random_uuid())::text||''/''||coalesce(can_manage_leads(null)::text,''null'')','true/false/false/false');
:done
:act_sales2
select scr.val('L11','sales A2','sees own 4 + the same pool of 3, not sales A''s','select string_agg(full_name, '','' order by full_name) from public.leads','other1,other2,other3,other4,pool1,pool2,pool3');
:done
:act_mgrA
select scr.val('M01','manager A','sees ALL 12 branch A leads (every employee + pool), no branch B','select count(*)||''/''||count(*) filter (where branch_id=''bbbbbbbb-0000-0000-0000-00000000000b'')::text from public.leads','12/0');
select scr.val('M02','manager A','follow-ups of all branch A leads','select count(*)::text from public.lead_followups','12');
select scr.val('M03','manager A','can_manage_leads own / other branch','select can_manage_leads(''aaaaaaaa-0000-0000-0000-00000000000a'')::text||''/''||can_manage_leads(''bbbbbbbb-0000-0000-0000-00000000000b'')::text','true/false');
select scr.t('M04','manager A','update a branch B lead','update public.leads set interest_notes=''x'' where branch_id=''bbbbbbbb-0000-0000-0000-00000000000b''','^ALLOWED rows=0$');
:done
:act_mgrB
select scr.val('M05','manager B','sees only branch B leads','select count(*)||''/''||count(*) filter (where branch_id=''aaaaaaaa-0000-0000-0000-00000000000a'')::text from public.leads','3/0');
:done
:act_salesB
select scr.val('X01','sales B','sees branch B pool only, none of branch A','select count(*)||''/''||count(*) filter (where branch_id=''aaaaaaaa-0000-0000-0000-00000000000a'')::text from public.leads','3/0');
select scr.t('X02','sales B','update a branch A lead','update public.leads set interest_notes=''x'' where branch_id=''aaaaaaaa-0000-0000-0000-00000000000a''','^ALLOWED rows=0$');
select scr.t('X03','sales B','insert a follow-up on a branch A lead','insert into public.lead_followups(lead_id,branch_id,due_at,status,created_by) select id,branch_id,now(),''pending'',''00000000-0000-0000-0000-0000000000c4'' from public.leads limit 0','^ALLOWED rows=0$');
:done
:act_super
select scr.val('S01','super admin','sees all 12 + 3 leads','select count(*)::text from public.leads','15');
select scr.val('S02','super admin','can_manage_leads any branch','select can_manage_leads(''aaaaaaaa-0000-0000-0000-00000000000a'')::text||''/''||can_manage_leads(''bbbbbbbb-0000-0000-0000-00000000000b'')::text','true/true');
:done
:act_recepA
select scr.t('U01','reception A','list leads (no sales role)','select id from public.leads','^ALLOWED rows=0$');
select scr.val('U01b','reception A','can_manage_leads false even for own branch','select can_manage_leads(''aaaaaaaa-0000-0000-0000-00000000000a'')::text','false');
select scr.t('U02','reception A','insert a lead','insert into public.leads(full_name,phone,branch_id,created_by) values (''r'',''0100000003'',''aaaaaaaa-0000-0000-0000-00000000000a'',''00000000-0000-0000-0000-0000000000a3'')','^DENIED 42501');
:done
:act_coachA
select scr.t('U03','coach A','list leads / follow-ups','select id from public.leads union all select id from public.lead_followups','^ALLOWED rows=0$');
:done
:act_cust
select scr.t('U04','member (customer)','list leads','select id from public.leads','^ALLOWED rows=0$');
:done
:act_inact
select scr.t('U05','DEACTIVATED sales employee','list leads','select id from public.leads','^ALLOWED rows=0$');
select scr.val('U05b','DEACTIVATED sales employee','can_manage_leads never grants (false or NULL; NULL = deny in RLS — on Production''s code it is NULL)','select (coalesce(can_manage_leads(''aaaaaaaa-0000-0000-0000-00000000000a''),false) = false)::text','true');
:done
:act_anon
select scr.t('U06','anon','list leads (table grants permitting)','select id from public.leads','^(ALLOWED rows=0|DENIED 42501)');
select scr.val('U06b','anon','can_manage_leads is never true (false or NULL)','select (coalesce(can_manage_leads(''aaaaaaaa-0000-0000-0000-00000000000a''),false) = false)::text','true');
:done
:act_nouid
select scr.val('U07','authenticated role, no sub claim','can_manage_leads is never true for a missing identity (false or NULL)','select (coalesce(can_manage_leads(''aaaaaaaa-0000-0000-0000-00000000000a''),false) = false)::text','true');
select scr.t('U07b','authenticated role, no sub claim','list leads','select id from public.leads','^ALLOWED rows=0$');
:done

-- exhaustive equivalence: the EXACT set of lead ids and follow-up ids each persona can see (md5 of the sorted id list) — must be identical before/after
:act_salesA
select scr.val('E00','sales A','visible lead ids / follow-up ids (md5 of the sorted sets)','select (select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.leads)||''/''||(select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.lead_followups)','HASH');
:done
:act_sales2
select scr.val('E01','sales A2','visible lead ids / follow-up ids (md5 of the sorted sets)','select (select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.leads)||''/''||(select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.lead_followups)','HASH');
:done
:act_mgrA
select scr.val('E02','manager A','visible lead ids / follow-up ids (md5 of the sorted sets)','select (select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.leads)||''/''||(select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.lead_followups)','HASH');
:done
:act_mgrB
select scr.val('E03','manager B','visible lead ids / follow-up ids (md5 of the sorted sets)','select (select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.leads)||''/''||(select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.lead_followups)','HASH');
:done
:act_salesB
select scr.val('E04','sales B','visible lead ids / follow-up ids (md5 of the sorted sets)','select (select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.leads)||''/''||(select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.lead_followups)','HASH');
:done
:act_super
select scr.val('E05','super admin','visible lead ids / follow-up ids (md5 of the sorted sets)','select (select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.leads)||''/''||(select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.lead_followups)','HASH');
:done
:act_recepA
select scr.val('E06','reception A','visible lead ids / follow-up ids (md5 of the sorted sets)','select (select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.leads)||''/''||(select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.lead_followups)','HASH');
:done
:act_coachA
select scr.val('E07','coach A','visible lead ids / follow-up ids (md5 of the sorted sets)','select (select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.leads)||''/''||(select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.lead_followups)','HASH');
:done
:act_inact
select scr.val('E08','DEACTIVATED sales','visible lead ids / follow-up ids (md5 of the sorted sets)','select (select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.leads)||''/''||(select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.lead_followups)','HASH');
:done
:act_anon
select scr.val('E09','anon','visible lead ids / follow-up ids (md5 of the sorted sets)','select (select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.leads)||''/''||(select md5(coalesce(string_agg(id::text, '','' order by id), '''')) from public.lead_followups)','HASH');
:done
-- catalog (expected to differ before/after by design: marked CAT)
select scr.valsu('CAT1','catalog','security mode / owner / search_path of can_manage_leads','select prosecdef::text||''/''||pg_get_userbyid(proowner)||''/''||coalesce(proconfig::text,''-'') from pg_proc where proname=''can_manage_leads''','CAT');
select scr.valsu('G01','catalog','EXECUTE grants unchanged (acl)','select proacl::text from pg_proc where proname=''can_manage_leads''','CAT');
select scr.valsu('G02','catalog','single uuid parameter (a branch id, never a user), SQL language, no dynamic SQL','select pronargs::text||''/''||proargtypes::regtype::text||''/''||(prosrc !~* ''execute'')::text||''/''||(select lanname from pg_language where oid=prolang)','1/uuid/true/sql');
select scr.valsu('G03','catalog','still STABLE; policies referencing can_manage_leads (before 6, after: insert x2 + with_check x2)','select provolatile::text||''/''||(select count(*) from pg_policies where schemaname=''public'' and (qual ilike ''%can_manage_leads%'' or with_check ilike ''%can_manage_leads%''))::text','CAT');
\echo ===== RESULTS =====
select format('%-5s %-4s | %-30s | %-90s | exp: %s | act: %s', id, case when pass then 'PASS' else 'FAIL' end, left(who,30), left(what,90), expected, actual) from scr.res order by ord;
select 'SUMMARY total='||count(*)||' pass='||count(*) filter (where pass)||' fail='||count(*) filter (where not pass) from scr.res where expected <> 'CAT';
