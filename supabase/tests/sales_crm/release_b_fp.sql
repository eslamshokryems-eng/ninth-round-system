-- LOCAL ONLY. Catalog fingerprint of everything Release B touches (one md5 per section; data is excluded). Used by release_b_run.sh to prove
-- that a rollback restores the earlier shape EXACTLY and a re-apply reproduces Release B exactly.
\pset tuples_only on
\pset format unaligned
\pset fieldsep '\t'
select 'policies_leads', md5(coalesce(string_agg(tablename||'.'||policyname||':'||cmd||':'||permissive||':'||array_to_string(roles,',')||':'||coalesce(qual,'')||':'||coalesce(with_check,''), '|' order by tablename, policyname), ''))
  from pg_policies where schemaname='public' and tablename in ('leads','lead_followups');
select 'policies_history', md5(coalesce(string_agg(tablename||'.'||policyname||':'||cmd||':'||coalesce(qual,''), '|' order by tablename, policyname), ''))
  from pg_policies where schemaname='public' and tablename in ('lead_activities','lead_assignments');
select 'columns', md5(string_agg(table_name||'.'||column_name||':'||data_type||':'||is_nullable||':'||coalesce(column_default,''), '|' order by table_name, column_name))
  from information_schema.columns where table_schema='public' and table_name in ('leads','lead_followups');
select 'constraints', md5(string_agg(conrelid::regclass::text||'.'||conname||':'||pg_get_constraintdef(oid), '|' order by conrelid::regclass::text, conname))
  from pg_constraint where conrelid in ('public.leads'::regclass, 'public.lead_followups'::regclass);
select 'triggers', md5(string_agg(tgrelid::regclass::text||'.'||tgname||':'||tgenabled::text||':'||pg_get_triggerdef(oid), '|' order by tgrelid::regclass::text, tgname))
  from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace and relname in ('leads','lead_followups','lead_activities','lead_assignments'));
select 'functions', md5(coalesce(string_agg(p.oid::regprocedure::text||':'||md5(replace(p.prosrc, chr(13), ''))||':'||p.prosecdef||':'||coalesce(array_to_string(p.proconfig,','),'')||':'||coalesce((select string_agg(a::text, ',' order by a::text) from unnest(p.proacl) a),''), '|' order by p.oid::regprocedure::text), ''))
  from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in (
    'can_manage_leads','my_sales_branch','auth_role','enforce_lead_assignment_rules','get_lead_timeline',
    'can_work_lead','log_lead_interaction','set_lead_next_action','add_lead_note','set_lead_interest','assign_leads','get_my_worklist',
    'get_worklist_summary','get_lead_activities','get_lead_assignments','get_lead_workspace_state','enforce_lead_insert_rules',
    'guard_lead_last_contacted','record_lead_assignment','guard_lead_history');
select 'tables', coalesce(string_agg(relname||':'||relrowsecurity, ',' order by relname), '-')
  from pg_class where relnamespace='public'::regnamespace and relkind='r' and relname in ('lead_activities','lead_assignments');
select 'indexes', md5(string_agg(indexrelid::regclass::text||':'||pg_get_indexdef(indexrelid), '|' order by indexrelid::regclass::text))
  from pg_index where indrelid in ('public.leads'::regclass, 'public.lead_followups'::regclass);
select 'grants', md5(coalesce(string_agg(table_name||':'||grantee||':'||privilege_type, '|' order by table_name, grantee, privilege_type), ''))
  from information_schema.role_table_grants where table_schema='public' and table_name in ('leads','lead_followups','lead_activities','lead_assignments');
