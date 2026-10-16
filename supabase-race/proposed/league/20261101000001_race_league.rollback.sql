-- ROLLBACK for 20261101000001_race_league.sql — PROPOSED, NOT APPLIED. Run only after an explicit decision, ideally from a fresh backup/snapshot.
--
-- What it does: drops every race_league_* table (tables first: their triggers use the guard functions) and then every race_league_* function (and with them the triggers, indexes, RLS state and the ledger's identity sequence).
-- What it does NOT touch: any race_* object of the race engine, the existing audit log, auth, storage, the gym system.
-- What it cannot undo: audit rows already written by league actions (action 'league.*' in race_audit_log) — that table is append-only by design and keeps them.
-- DATA LOSS: all league data (seasons, challenges, participants, attempts, points ledger, appeals, corrections) is destroyed. Export first if any of it matters.
-- It is NOT a supabase migration (it lives outside supabase/migrations); apply it by hand, once, inside a transaction.
begin;
drop table if exists
  race_league_appeals, race_league_corrections, race_league_correction_requests, race_league_eligibility_decisions,
  race_league_points_ledger, race_league_attempts, race_league_participants, race_league_staff, race_league_challenges, race_league_seasons
  cascade;   -- cascade: league functions taking a league row type (race_league_attempt_json) go with their table; only league objects can depend on league tables
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'race\_league\_%' loop
    execute format('drop function %s', f.sig);
  end loop;
end $$;
-- verify: nothing league-shaped is left behind
do $$
begin
  if exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relname like 'race\_league\_%')
     or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname like 'race\_league\_%') then
    raise exception 'rollback incomplete: race_league_* objects remain';
  end if;
end $$;
commit;
