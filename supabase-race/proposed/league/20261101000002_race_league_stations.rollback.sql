-- ROLLBACK for 20261101000002_race_league_stations.sql — PROPOSED, NOT APPLIED. Run only after an explicit decision, ideally from a fresh backup/snapshot.
--
-- What it does: removes ONLY the station-layout objects (the four layout / station-result tables, the deferred check on race_league_attempts and the layout functions).
--   The base league migration (20261101000001) is left exactly as it was, so a league without station layouts keeps working.
-- DATA LOSS: every layout version, exercise definition and per-station result is destroyed. An attempt keeps its total (attempts.value), but the breakdown behind it is gone.
--   Export race_league_layouts / _layout_stations / _layout_exercises / _station_results first if any of it matters.
-- What it does NOT touch: any race_* object of the race engine, the existing audit log (its 'league.layout.*' / 'league.attempt.stations*' rows stay: that table is append-only by design).
-- To remove the whole league instead, use 20261101000001_race_league.rollback.sql (it also drops these objects). Not a supabase migration; apply by hand, once, in a transaction.
begin;
drop trigger if exists trg_race_league_attempt_stations on race_league_attempts;
drop trigger if exists trg_race_league_challenges_layout_metric on race_league_challenges;
drop table if exists race_league_station_results, race_league_layout_exercises, race_league_layout_stations, race_league_layouts cascade;
drop function if exists race_league_station_breakdown(uuid);
drop function if exists race_league_correct_station_attempt(uuid, jsonb, text);
drop function if exists race_league_record_station_attempt(uuid, uuid, int, jsonb, timestamptz, uuid);
drop function if exists race_league_get_layout(uuid, int);
drop function if exists race_league_set_layout(uuid, jsonb, text);
drop function if exists race_league_check_station_attempt();
drop function if exists race_league_guard_layout_metric();
drop function if exists race_league_attempt_stations(uuid);
drop function if exists race_league_station_total(uuid, jsonb);
drop function if exists race_league_validate_layout(jsonb, text, text);
drop function if exists race_league_layout_metric_ok(text, text, text);
-- verify: no station-layout object is left behind
do $$
begin
  if exists (select 1 from pg_class where relnamespace = 'public'::regnamespace and relname in ('race_league_layouts', 'race_league_layout_stations', 'race_league_layout_exercises', 'race_league_station_results'))
     or exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname in ('race_league_set_layout', 'race_league_get_layout', 'race_league_record_station_attempt',
        'race_league_correct_station_attempt', 'race_league_station_breakdown', 'race_league_validate_layout', 'race_league_station_total', 'race_league_attempt_stations',
        'race_league_check_station_attempt', 'race_league_guard_layout_metric', 'race_league_layout_metric_ok')) then
    raise exception 'rollback incomplete: station-layout objects remain';
  end if;
end $$;
commit;
