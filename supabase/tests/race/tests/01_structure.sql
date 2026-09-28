-- 1. Migration success — structure, isolation, lock-down.
reset role;

select race_test.eq((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'race\_%')::int,
                    26, 'structure: 26 race_* tables created');

select race_test.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'race\_%' and not c.relrowsecurity),
  'structure: RLS enabled on every race_* table');

select race_test.eq((select count(*) from pg_type where typname like 'race\_%' and typtype = 'e')::int,
                    21, 'structure: 21 race_* enums');

select race_test.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'race\_%' and p.prosecdef
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  'structure: every SECURITY DEFINER race function pins search_path');

select race_test.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'race\_%'
    and (has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE')
         or has_any_column_privilege('anon', c.oid, 'UPDATE'))),
  'lock-down: anon has no UPDATE/DELETE privilege on any race table');

select race_test.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'race\_%'
    and c.relname <> 'race_judge_applications' and has_any_column_privilege('anon', c.oid, 'INSERT')),
  'lock-down: anon can INSERT only into race_judge_applications');

select race_test.ok(not exists (
  select 1 from unnest(array['race_athletes', 'race_payments', 'race_payment_events', 'race_clock', 'race_pauses',
    'race_tie_draws', 'race_check_ins', 'race_start_slots', 'race_station_results', 'race_performance_events',
    'race_action_reviews', 'race_ocr_records', 'race_result_corrections', 'race_rankings']) t
  where has_any_column_privilege('authenticated', t, 'INSERT') or has_any_column_privilege('authenticated', t, 'UPDATE')
     or has_table_privilege('authenticated', t, 'DELETE')),
  'lock-down: 14 ledger/state tables have NO client write privilege (RPC-only)');

select race_test.ok(not has_any_column_privilege('authenticated', 'race_registrations', 'INSERT')
                    and not has_column_privilege('authenticated', 'race_registrations', 'race_status', 'UPDATE')
                    and not has_column_privilege('authenticated', 'race_registrations', 'race_number', 'UPDATE')
                    and has_column_privilege('authenticated', 'race_registrations', 'heat_id', 'UPDATE'),
  'lock-down: registrations — only heat_id/pushup_style are client-updatable (race_status/race_number are not)');

select race_test.ok(not has_column_privilege('authenticated', 'race_events', 'status', 'UPDATE')
                    and not has_column_privilege('authenticated', 'race_events', 'work_ms', 'UPDATE')
                    and not has_column_privilege('authenticated', 'race_events', 'heats_locked_at', 'UPDATE'),
  'lock-down: event status / work_ms / heats_locked_at are not client-updatable');

select race_test.eq((select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
                     where c.relname like 'race\_%' and t.tgname like '%append_only')::int,
                    7, 'structure: append-only triggers on 7 ledger tables');

select race_test.ok(to_regprocedure('race_create_event(uuid,text,date,text,text,timestamptz)') is not null
                    and to_regprocedure('race_now_ms(uuid)') is not null
                    and to_regprocedure('race_plan_schedule(integer[],integer,integer,integer,integer,integer,integer,integer)') is not null,
  'structure: foundation RPCs and timing functions present');
