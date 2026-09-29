-- THE NINTH race system — Phase 3 ROLLBACK (manual, emergency use only).
--
-- Reverses migrations 20260928000001 … 20260928000005 and restores the
-- database schema to exactly its pre-race state (verified by
-- supabase/tests/race/run.sh, step 6: catalog fingerprint identical).
--
-- NOT a migration and NOT picked up by `supabase db push` (it lives outside
-- supabase/migrations on purpose — the repo keeps a single, forward-only
-- migration system). Run it by hand with psql against a database where the
-- race migrations must be withdrawn, then delete the five race rows from
-- supabase_migrations.schema_migrations so the CLI's history matches.
--
-- DESTROYS ALL RACE DATA. Race entries already written to admin_audit_log
-- are kept (that table is append-only by design).

begin;

drop policy if exists "race event managers read race audit entries" on admin_audit_log;

delete from role_permissions where permission_key like 'race.%';
delete from permissions where key like 'race.%';

do $$
declare
  r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname like 'race\_%'
  loop
    execute format('drop table if exists public.%I cascade', r.relname);
  end loop;

  for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'race\_%'
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;

  for r in select t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
           where n.nspname = 'public' and t.typtype = 'e' and t.typname like 'race\_%'
  loop
    execute format('drop type if exists public.%I cascade', r.typname);
  end loop;
end $$;

commit;
