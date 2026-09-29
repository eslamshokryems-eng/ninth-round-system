-- Read-only post-deployment verification of THE NINTH's database. Run it (SQL editor or psql) after `supabase db push` on staging and
-- again on production. It changes nothing; it RAISES on the first problem and prints a line per check otherwise.
-- The same script runs inside the test harness, so it is itself tested.
do $$
declare bad text; n int;
begin
  -- 1. the schema is THE NINTH's alone
  select string_agg(c.relname, ', ') into bad from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'p') and c.relname not like 'race\_%'
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e');
  if bad is not null then raise exception 'VERIFY FAIL: non-race relations in public: %', bad; end if;
  select count(*) into n from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and relname like 'race\_%';
  if n < 30 then raise exception 'VERIFY FAIL: expected at least 30 race tables, found %', n; end if;
  raise notice 'OK  % race tables, nothing else in public', n;

  -- 2. RLS everywhere
  select string_agg(relname, ', ') into bad from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity;
  if bad is not null then raise exception 'VERIFY FAIL: RLS is off on: %', bad; end if;
  raise notice 'OK  row-level security is enabled on every table';

  -- 3. anonymous callers can never write ledgers or read personal data
  select string_agg(c.relname, ', ') into bad from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and (has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE'));
  if bad is not null then raise exception 'VERIFY FAIL: anon can UPDATE/DELETE: %', bad; end if;
  select string_agg(t, ', ') into bad from unnest(array['race_athletes', 'race_registrations', 'race_payments', 'race_check_ins', 'race_start_slots', 'race_station_results',
      'race_performance_events', 'race_profiles', 'race_audit_log', 'race_staff']) t where has_table_privilege('anon', t, 'SELECT');
  if bad is not null then raise exception 'VERIFY FAIL: anon can read: %', bad; end if;
  raise notice 'OK  anon cannot read personal/ledger tables and cannot update or delete anything';

  -- 4. the audit log and ledgers are immutable
  select string_agg(t, ', ') into bad from unnest(array['race_audit_log', 'race_pauses', 'race_check_in_corrections', 'race_performance_events', 'race_action_reviews', 'race_result_corrections', 'race_tie_draws']) t
   where not exists (select 1 from pg_trigger g where g.tgrelid = ('public.' || t)::regclass and not g.tgisinternal);
  if bad is not null then raise exception 'VERIFY FAIL: no immutability trigger on: %', bad; end if;
  if has_table_privilege('authenticated', 'race_audit_log', 'INSERT') or has_table_privilege('authenticated', 'race_audit_log', 'UPDATE') or has_table_privilege('authenticated', 'race_audit_log', 'DELETE') then
    raise exception 'VERIFY FAIL: authenticated can write race_audit_log';
  end if;
  raise notice 'OK  audit log and ledgers are protected by triggers and have no client write privilege';

  -- 5. functions: every SECURITY DEFINER race function pins search_path; engine internals are not API surface
  select string_agg(p.proname, ', ') into bad from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.proname like 'race\_%'
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  if bad is not null then raise exception 'VERIFY FAIL: SECURITY DEFINER without search_path: %', bad; end if;
  select string_agg(f, ', ') into bad from unnest(array['race_advance_core(uuid)', 'race_advance_all()', 'race_bind_due_slots(uuid)', 'race_freeze_schedule(uuid)', 'race_wall_at(uuid,bigint)',
      'race_log_audit_event(text,text,uuid,jsonb,jsonb,jsonb)', 'race_audit(text,uuid,text,uuid,jsonb,jsonb,jsonb)']) f
   where has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE');
  if bad is not null then raise exception 'VERIFY FAIL: internal functions callable by API roles: %', bad; end if;
  select string_agg(f, ', ') into bad from unnest(array['race_start_event(uuid)', 'race_pause(uuid,text)', 'race_resume(uuid)', 'race_skip_athlete(uuid,text)', 'race_mark_dnf(uuid,text)',
      'race_close_heat_without_start(uuid,integer,text)', 'race_correct_check_in(uuid,uuid,text)', 'race_override_dns(uuid,text)', 'race_control_state(uuid)', 'race_set_account_flags(uuid,boolean,boolean,boolean)']) f
   where has_function_privilege('anon', f, 'EXECUTE');
  if bad is not null then raise exception 'VERIFY FAIL: control functions callable by anon: %', bad; end if;
  raise notice 'OK  functions pin search_path; engine internals and control RPCs are closed to anonymous callers';

  -- 6. storage
  select count(*) into n from storage.buckets where id in ('race-evidence', 'race-athlete-photos', 'race-documents') and not public;
  if n <> 3 then raise exception 'VERIFY FAIL: evidence, athlete-photo and document buckets must be private'; end if;
  if not exists (select 1 from storage.buckets where id = 'race-event-assets' and public) then raise exception 'VERIFY FAIL: race-event-assets must be public'; end if;
  select string_agg(b.id, ', ') into bad from storage.buckets b where b.file_size_limit is null or b.allowed_mime_types is null;
  if bad is not null then raise exception 'VERIFY FAIL: buckets without size/MIME limits: %', bad; end if;
  select string_agg(policyname, ', ') into bad from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname not like 'race %';
  if bad is not null then raise exception 'VERIFY FAIL: non-race storage policies: %', bad; end if;
  raise notice 'OK  4 race buckets (3 private, 1 public), size/MIME limits set, only race policies on storage.objects';
end $$;

-- Informational (not failures): the first Super Admin must exist after bootstrap.
select case when count(*) filter (where is_super_admin and is_active) >= 1
            then 'OK  at least one active Super Admin exists'
            else 'NOTE no Super Admin yet — run supabase-race/bootstrap/promote_super_admin.sql' end as super_admin_status
  from race_profiles;
