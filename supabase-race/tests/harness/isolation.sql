-- THE NINTH is its own project: prove that nothing here belongs to, depends on, or points at another system.
do $$
declare n int; bad text;
begin
  -- 1. every relation in public is race_* (extension-owned objects excluded)
  select string_agg(c.relname, ', ') into bad from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'm', 'S', 'p')
     and c.relname not like 'race\_%'
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e');
  if bad is not null then raise exception 'FAIL: non-race relations exist: %', bad; end if;
  raise notice 'PASS  every table/view/sequence in public is race_* (%)', (select count(*) from pg_class where relnamespace = 'public'::regnamespace and relkind in ('r','p') and relname like 'race\_%') || ' tables';

  -- 2. every function in public is race_* (or extension-owned)
  select string_agg(p.proname, ', ') into bad from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname not like 'race\_%'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e');
  if bad is not null then raise exception 'FAIL: non-race functions exist: %', bad; end if;
  raise notice 'PASS  every function in public is race_*';

  -- 3. every type in public is race_*
  select string_agg(t.typname, ', ') into bad from pg_type t
   where t.typnamespace = 'public'::regnamespace and t.typtype in ('e', 'c', 'd') and t.typname not like 'race\_%' and t.typname not like '\_race\_%'
     and not exists (select 1 from pg_class c where c.reltype = t.oid and c.relkind <> 'c' and c.relname not like 'race\_%')
     and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e')
     and t.typrelid = 0;
  if bad is not null then raise exception 'FAIL: non-race types exist: %', bad; end if;
  raise notice 'PASS  every enum/domain in public is race_*';

  -- 4. foreign keys only ever point at race_* tables or THIS project's auth.users
  select string_agg(conrelid::regclass || ' -> ' || confrelid::regclass, ', ') into bad from pg_constraint
   where contype = 'f' and connamespace = 'public'::regnamespace
     and confrelid::regclass::text not like 'race\_%' and confrelid::regclass::text <> 'auth.users';
  if bad is not null then raise exception 'FAIL: foreign keys leave the race schema: %', bad; end if;
  raise notice 'PASS  every foreign key targets a race_* table or auth.users of this project (% keys)', (select count(*) from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace);

  -- 5. none of the gym-management objects exist
  select string_agg(x, ', ') into bad from unnest(array['profiles','branches','members','memberships','admin_audit_log','permissions','role_permissions','staff_profiles','check_ins','membership_payments']) x
   where to_regclass('public.' || x) is not null;
  if bad is not null then raise exception 'FAIL: gym tables present: %', bad; end if;
  select string_agg(x, ', ') into bad from unnest(array['is_super_admin','has_permission','auth_role','log_audit_event','is_branch_staff']) x
   where exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = x);
  if bad is not null then raise exception 'FAIL: gym functions present: %', bad; end if;
  raise notice 'PASS  no gym-management table or function exists in this database';

  -- 6. no function body or policy mentions a gym object
  select string_agg(distinct proname, ', ') into bad from pg_proc
   where pronamespace = 'public'::regnamespace and proname like 'race\_%'
     and prosrc ~* '(public\.|\m)(profiles|branches|admin_audit_log|log_audit_event|is_branch_staff|auth_role|has_permission)\M(?!_)'
     and prosrc !~* 'race_has_permission|race_profiles';
  if bad is not null then raise exception 'FAIL: race functions reference gym objects: %', bad; end if;
  raise notice 'PASS  no race function body references a gym object';

  select count(*) into n from pg_policies where schemaname = 'public' and (qual ~* '\m(profiles|branches|admin_audit_log)\M' or with_check ~* '\m(profiles|branches|admin_audit_log)\M');
  if n > 0 then raise exception 'FAIL: % policies reference gym tables', n; end if;
  raise notice 'PASS  no RLS policy references a gym table';

  -- 7. race tables all have RLS enabled
  select string_agg(relname, ', ') into bad from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity;
  if bad is not null then raise exception 'FAIL: tables without RLS: %', bad; end if;
  raise notice 'PASS  RLS is enabled on every table';
end $$;
