-- STAGING DATABASE CHECKS (read-only). Expected counts come from the validated PostgreSQL 17.11 test database (Phase 12 + 14 + 17.11 compatibility run).
-- Run after `supabase db push` and verify/verify_deployment.sql. RAISES on the first difference; prints OK lines otherwise.
\set ON_ERROR_STOP on
do $$
declare n int; bad text; v text;
begin
  select current_setting('server_version') into v;
  if v not like '17.%' then raise exception 'CHECK FAIL: expected PostgreSQL 17.x, server is %', v; end if;
  raise notice 'OK  PostgreSQL %', v;

  select count(*) into n from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r';
  if n <> 35 then raise exception 'CHECK FAIL: expected 35 tables in public, found %', n; end if;
  select count(*) into n from pg_class where relnamespace = 'public'::regnamespace and relkind in ('v', 'm', 'p', 'f');
  if n <> 0 then raise exception 'CHECK FAIL: unexpected views/materialized views/partitioned/foreign tables in public: %', n; end if;
  -- THE NINTH's own functions: race_* and not owned by an extension (extensions such as pg_trgm / pgcrypto may or may not live in public, depending on the platform)
  select count(*) into n from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname like 'race\_%'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  if n <> 147 then raise exception 'CHECK FAIL: expected 147 race_* functions in public, found %', n; end if;
  select string_agg(distinct e.extname, ', ') into bad from pg_depend d join pg_extension e on e.oid = d.refobjid join pg_proc p on p.oid = d.objid
   where d.deptype = 'e' and p.pronamespace = 'public'::regnamespace and e.extname not in ('pg_trgm', 'pgcrypto');
  if bad is not null then raise exception 'CHECK FAIL: unexpected extensions install functions into public: %', bad; end if;
  select count(*) into n from pg_policies where schemaname = 'public';
  if n <> 49 then raise exception 'CHECK FAIL: expected 49 RLS policies in public, found %', n; end if;
  select count(*) into n from pg_policies where schemaname = 'storage' and policyname like 'race%';
  if n <> 13 then raise exception 'CHECK FAIL: expected 13 race storage policies, found %', n; end if;
  select count(*) into n from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal;
  if n <> 66 then raise exception 'CHECK FAIL: expected 66 triggers in public, found %', n; end if;
  select count(*) into n from pg_type where typnamespace = 'public'::regnamespace and typtype = 'e';
  if n <> 23 then raise exception 'CHECK FAIL: expected 23 enum types in public, found %', n; end if;
  raise notice 'OK  35 tables, 147 race functions, 49 public + 13 storage policies, 66 triggers, 23 enums, no views';

  -- RLS on every table; no gym/other objects
  select string_agg(relname, ', ') into bad from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity;
  if bad is not null then raise exception 'CHECK FAIL: RLS off on: %', bad; end if;
  select string_agg(c.relname, ', ') into bad from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relname not like 'race\_%';
  if bad is not null then raise exception 'CHECK FAIL: non-race tables in public (gym cross-contamination?): %', bad; end if;
  select string_agg(p.proname, ', ') into bad from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname not like 'race\_%'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  if bad is not null then raise exception 'CHECK FAIL: non-race functions in public: %', bad; end if;
  select string_agg(t.typname, ', ') into bad from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype in ('e', 'd') and t.typname not like 'race\_%';
  if bad is not null then raise exception 'CHECK FAIL: non-race types in public: %', bad; end if;
  select string_agg(table_name, ', ') into bad from information_schema.tables where table_schema = 'public' and table_name ~* '(member|branch|invoice|gym|trainer|class_session|subscription)';
  if bad is not null then raise exception 'CHECK FAIL: gym-looking tables present: %', bad; end if;
  raise notice 'OK  RLS on every table; nothing but race_* objects in public; no gym-looking tables';

  -- Realtime: race_clock only (no personal-data or ledger table)
  select string_agg(tablename, ', ') into bad from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename <> 'race_clock';
  if bad is not null then raise exception 'CHECK FAIL: tables other than race_clock are published to realtime: %', bad; end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'race_clock') then
    raise exception 'CHECK FAIL: race_clock is NOT in the supabase_realtime publication'; end if;
  raise notice 'OK  realtime publishes race_clock only';

  -- Storage: the four buckets with the exact visibility / limits / MIME lists
  select count(*) into n from storage.buckets where id in ('race-evidence', 'race-athlete-photos', 'race-event-assets', 'race-documents');
  if n <> 4 then raise exception 'CHECK FAIL: expected 4 race buckets, found %', n; end if;
  if not exists (select 1 from storage.buckets where id = 'race-evidence' and not public and file_size_limit = 10485760 and allowed_mime_types @> array['image/jpeg','image/png','image/webp'] and cardinality(allowed_mime_types) = 3) then raise exception 'CHECK FAIL: race-evidence bucket settings'; end if;
  if not exists (select 1 from storage.buckets where id = 'race-athlete-photos' and not public and file_size_limit = 5242880 and cardinality(allowed_mime_types) = 3) then raise exception 'CHECK FAIL: race-athlete-photos bucket settings'; end if;
  if not exists (select 1 from storage.buckets where id = 'race-event-assets' and public and file_size_limit = 10485760 and cardinality(allowed_mime_types) = 5) then raise exception 'CHECK FAIL: race-event-assets bucket settings'; end if;
  if not exists (select 1 from storage.buckets where id = 'race-documents' and not public and file_size_limit = 20971520 and cardinality(allowed_mime_types) = 3) then raise exception 'CHECK FAIL: race-documents bucket settings'; end if;
  select count(*) into n from storage.buckets where id like 'race-%' and public;
  if n <> 1 then raise exception 'CHECK FAIL: exactly one race bucket (event-assets) may be public, found %', n; end if;
  raise notice 'OK  4 race buckets (3 private, 1 public) with the expected size/MIME limits';
end $$;
