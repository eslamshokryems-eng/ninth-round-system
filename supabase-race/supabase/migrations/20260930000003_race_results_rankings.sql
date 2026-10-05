-- THE NINTH — Phase 9: results, rankings, official publication, corrections.
--
-- Rules (locked in 01-schema-and-timing-model.md §6, decisions D-6 / D-7 / F-2 / F-5):
--   * station score = the derived official_score (higher is better at all 9 stations)
--   * station placement per station x category, standard competition ranking (1, 2, 2, 4)
--   * only FINISHED athletes with a scored result at every station are ranked; DNS / DNF / withdrawn are listed, never ranked
--   * overall = sum of the 9 placements (lowest wins); tie-break: S04 technique, S07 technique, their sum, then the tie is kept
--   * snapshots are append-only versions in race_rankings; OFFICIAL only when every result is LOCKED/CORRECTED, nothing is pending
--     review, nobody is still racing and nothing is unscored
--   * a correction (Event Manager only, reason mandatory) is a ledger row + a new snapshot version; old versions are never edited
--
-- The public leaderboard is a read-only function. It never advances the engine and never writes.

-- A correction must survive a late re-derivation: a CORRECTED result keeps the corrected value.
create or replace function race_recompute_result(p_result_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_t jsonb := public.race_result_tally(p_result_id);
begin
  update public.race_station_results
     set derived = v_t,
         official_score = case when status = 'CORRECTED' then official_score else nullif(v_t ->> 'score', '')::numeric end,
         technique_score = case when status = 'CORRECTED' or (v_t ->> 'technique') is null then technique_score else (v_t ->> 'technique')::numeric end,
         derived_version = derived_version + 1
   where id = p_result_id;
  return v_t;
end;
$$;
revoke execute on function race_recompute_result(uuid) from public, anon, authenticated;

-- "Ahmed Mohamed Ali" -> "Ahmed A." (first name + last initial; one-word names stay as they are).
create or replace function race_display_name(p_full_name text)
returns text
language sql immutable
set search_path = ''
as $$
  select case when array_length(p, 1) is null then ''
              when array_length(p, 1) = 1 then p[1]
              else p[1] || ' ' || upper(left(p[array_length(p, 1)], 1)) || '.' end
    from (select regexp_split_to_array(btrim(p_full_name), '\s+') as p) q;
$$;

-- ---------------------------------------------------------------------------
-- The ranking itself (internal): one row per ranked athlete of one category, computed live from the results.
-- ---------------------------------------------------------------------------
create or replace function race_rank_rows(p_event_id uuid, p_category_id uuid)
returns table (
  registration_id uuid, race_number text, full_name text, placements jsonb, total_points int,
  tb_s04 numeric, tb_s07 numeric, tb_sum numeric, overall_rank int
)
language sql stable security definer
set search_path = ''
as $$
  with n as (select count(*)::int c from public.race_stations where event_id = p_event_id),
  scored as (
    select sr.registration_id, st.number, coalesce(sr.official_score, -1) as score, sr.technique_score
      from public.race_station_results sr
      join public.race_stations st on st.id = sr.station_id
      join public.race_registrations rg on rg.id = sr.registration_id
     where sr.event_id = p_event_id and rg.category_id = p_category_id and rg.race_status = 'FINISHED'
       and sr.status not in ('VOID_DNS', 'NOT_REACHED')
  ),
  eligible as (select registration_id from scored group by registration_id having count(*) = (select c from n)),
  placed as (
    select s.registration_id, s.number, s.technique_score,
           rank() over (partition by s.number order by s.score desc)::int as placement
      from scored s join eligible e using (registration_id)
  ),
  tot as (
    select registration_id, sum(placement)::int as total_points,
           jsonb_object_agg(number::text, placement) as placements,
           max(technique_score) filter (where number = 4) as t4,
           max(technique_score) filter (where number = 7) as t7
      from placed group by registration_id
  )
  select t.registration_id, rg.race_number, a.full_name, t.placements, t.total_points, t.t4, t.t7, t.t4 + t.t7,
         rank() over (order by t.total_points asc, t.t4 desc nulls last, t.t7 desc nulls last, (t.t4 + t.t7) desc nulls last)::int
    from tot t
    join public.race_registrations rg on rg.id = t.registration_id
    join public.race_athletes a on a.id = rg.athlete_id;
$$;
revoke execute on function race_rank_rows(uuid, uuid) from public, anon, authenticated;

-- What stands between a category and an official result.
create or replace function race_rank_blockers(p_event_id uuid, p_category_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with r as (
    select rg.id, rg.race_status
      from public.race_registrations rg
     where rg.event_id = p_event_id and rg.category_id = p_category_id and rg.status = 'CONFIRMED'
  ),
  res as (
    select sr.* from public.race_station_results sr join r on r.id = sr.registration_id and r.race_status = 'FINISHED'
     where sr.status not in ('VOID_DNS', 'NOT_REACHED')
  )
  select jsonb_build_object(
    'ranked',         (select count(*) from public.race_rank_rows(p_event_id, p_category_id)),
    'racing',         (select count(*) from r where r.race_status in ('CHECKED_IN', 'LATE_CHECK_IN', 'STARTED')),
    'pending_review', (select count(*) from res where res.status = 'REVIEW_PENDING' or coalesce((res.derived ->> 'pending_review')::int, 0) > 0),
    'not_locked',     (select count(*) from res where res.status not in ('LOCKED', 'CORRECTED', 'REVIEW_PENDING')),
    'unscored',       (select count(*) from res where res.official_score is null)
  );
$$;
revoke execute on function race_rank_blockers(uuid, uuid) from public, anon, authenticated;

create or replace function race_blockers_clear(p jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select (p ->> 'racing')::int = 0 and (p ->> 'pending_review')::int = 0 and (p ->> 'not_locked')::int = 0 and (p ->> 'unscored')::int = 0;
$$;
revoke execute on function race_blockers_clear(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Snapshot writer (internal). Idempotent: identical content to the latest version writes nothing.
-- ---------------------------------------------------------------------------
create or replace function race_write_snapshot(p_event_id uuid, p_category_id uuid, p_official boolean)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_latest int;
  v_old jsonb;
  v_new jsonb;
  v_old_official boolean;
  v_block jsonb := public.race_rank_blockers(p_event_id, p_category_id);
  v_version int;
  v_unchanged boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended('race_rank:' || p_category_id::text, 0));
  if p_official and not public.race_blockers_clear(v_block) then
    raise exception 'RACE_RESULTS_NOT_READY: %', v_block::text using errcode = 'check_violation';
  end if;

  select jsonb_agg(jsonb_build_array(x.registration_id, x.placements, x.total_points, x.tb_s04, x.tb_s07, x.tb_sum, x.overall_rank) order by x.registration_id)
    into v_new from public.race_rank_rows(p_event_id, p_category_id) x;
  if v_new is null then
    return jsonb_build_object('category_id', p_category_id, 'version', null, 'official', false, 'unchanged', true, 'ranked', 0, 'blockers', v_block);
  end if;

  select max(version) into v_latest from public.race_rankings where category_id = p_category_id;
  if v_latest is not null then
    select jsonb_agg(jsonb_build_array(r.registration_id, r.station_placements, r.total_points, r.tb_s04_technique, r.tb_s07_technique, r.tb_sum, r.overall_rank) order by r.registration_id),
           bool_and(r.is_official)
      into v_old, v_old_official
      from public.race_rankings r where r.category_id = p_category_id and r.version = v_latest;
    v_unchanged := v_old = v_new and v_old_official = p_official;
  end if;

  if v_unchanged then
    v_version := v_latest;
  else
    v_version := coalesce(v_latest, 0) + 1;
    insert into public.race_rankings (event_id, category_id, registration_id, version, station_placements, total_points,
                                      tb_s04_technique, tb_s07_technique, tb_sum, overall_rank, is_official, computed_by)
    select p_event_id, p_category_id, x.registration_id, v_version, x.placements, x.total_points, x.tb_s04, x.tb_s07, x.tb_sum, x.overall_rank, p_official, auth.uid()
      from public.race_rank_rows(p_event_id, p_category_id) x;
    perform public.race_audit('race.rankings.snapshot', p_event_id, 'race_categories', p_category_id, null,
      jsonb_build_object('version', v_version, 'official', p_official, 'ranked', jsonb_array_length(v_new)), '{}'::jsonb);
  end if;
  return jsonb_build_object('category_id', p_category_id, 'version', v_version, 'official', p_official, 'unchanged', v_unchanged,
                            'ranked', jsonb_array_length(v_new), 'blockers', v_block);
end;
$$;
revoke execute on function race_write_snapshot(uuid, uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff RPCs
-- ---------------------------------------------------------------------------

-- Provisional or official snapshot(s). Control roles may save provisional snapshots; only the Event Manager makes them official.
-- Once the event is official every snapshot is official again (an official result is never overtaken by a provisional one).
create or replace function race_compute_rankings(p_event_id uuid, p_category_id uuid default null, p_official boolean default false)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_official boolean := coalesce(p_official, false);
  v_status public.race_event_status;
  c record;
  v_out jsonb := '[]'::jsonb;
begin
  select status into v_status from public.race_events where id = p_event_id;
  if v_status is null then raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found'; end if;
  if (case when v_official then public.race_is_manager(p_event_id) else public.race_is_control(p_event_id) end) is not true then
    raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege';
  end if;
  if v_status in ('RESULTS_OFFICIAL', 'ARCHIVED') then
    v_official := true;
    if public.race_is_manager(p_event_id) is not true then raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege'; end if;
  end if;
  if v_status not in ('LIVE', 'FINISHED', 'RESULTS_OFFICIAL', 'ARCHIVED') then
    raise exception 'RACE_NOT_STARTED: there is nothing to rank yet' using errcode = 'check_violation';
  end if;
  perform public.race_advance_core(p_event_id);
  for c in select id from public.race_categories where event_id = p_event_id and (p_category_id is null or id = p_category_id) order by sort_order loop
    v_out := v_out || public.race_write_snapshot(p_event_id, c.id, v_official);
  end loop;
  if p_category_id is not null and jsonb_array_length(v_out) = 0 then raise exception 'RACE_NOT_FOUND: category' using errcode = 'no_data_found'; end if;
  return jsonb_build_object('official', v_official, 'categories', v_out);
end;
$$;
grant execute on function race_compute_rankings(uuid, uuid, boolean) to authenticated;
revoke execute on function race_compute_rankings(uuid, uuid, boolean) from public, anon;

-- Publish the official results: every category must be ready; the event becomes RESULTS_OFFICIAL (public). Idempotent.
create or replace function race_publish_results(p_event_id uuid)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_status public.race_event_status;
  v_res jsonb;
begin
  if public.race_is_manager(p_event_id) is not true then raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege'; end if;
  select status into v_status from public.race_events where id = p_event_id for update;
  if v_status is null then raise exception 'RACE_NOT_FOUND' using errcode = 'no_data_found'; end if;
  perform public.race_advance_core(p_event_id);
  select status into v_status from public.race_events where id = p_event_id;
  if v_status in ('RESULTS_OFFICIAL', 'ARCHIVED') then
    return jsonb_build_object('status', v_status, 'already', true);
  end if;
  if v_status <> 'FINISHED' then
    raise exception 'RACE_EVENT_NOT_FINISHED: results can be published once the race has finished (now %)', v_status using errcode = 'check_violation';
  end if;
  v_res := public.race_compute_rankings(p_event_id, null, true);
  update public.race_events set status = 'RESULTS_OFFICIAL' where id = p_event_id;
  perform public.race_audit('race.results.publish', p_event_id, 'race_events', p_event_id,
    jsonb_build_object('status', 'FINISHED'), jsonb_build_object('status', 'RESULTS_OFFICIAL'), jsonb_build_object('snapshots', v_res -> 'categories'));
  return jsonb_build_object('status', 'RESULTS_OFFICIAL', 'already', false, 'rankings', v_res);
end;
$$;
grant execute on function race_publish_results(uuid) to authenticated;
revoke execute on function race_publish_results(uuid) from public, anon;

-- What the correction screen needs: one athlete's nine results (ids included), by race number. Control only.
create or replace function race_athlete_results(p_event_id uuid, p_race_number text)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if public.race_is_control(p_event_id) is not true then raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege'; end if;
  select jsonb_build_object(
      'race_number', rg.race_number, 'name', a.full_name, 'category_code', c.code, 'race_status', rg.race_status,
      'results', coalesce((
        select jsonb_agg(jsonb_build_object('result_id', sr.id, 'station', st.number, 'station_name', st.name, 'status', sr.status,
                                           'official_score', sr.official_score, 'technique_score', sr.technique_score,
                                           'has_technique', st.has_technique) order by st.number)
          from public.race_station_results sr join public.race_stations st on st.id = sr.station_id
         where sr.registration_id = rg.id), '[]'::jsonb))
    into v
    from public.race_registrations rg
    join public.race_athletes a on a.id = rg.athlete_id
    join public.race_categories c on c.id = rg.category_id
   where rg.event_id = p_event_id and rg.race_number = upper(btrim(p_race_number));
  if v is null then raise exception 'RACE_NOT_FOUND: no athlete with that race number' using errcode = 'no_data_found'; end if;
  return v;
end;
$$;
grant execute on function race_athlete_results(uuid, text) to authenticated;
revoke execute on function race_athlete_results(uuid, text) from public, anon;

-- Correct a locked result. Event Manager only, reason mandatory, ledger + audit, never silent. If results are already official a new
-- official snapshot version is written in the same transaction (the previous version stays in history).
create or replace function race_correct_station_result(p_result_id uuid, p_field text, p_value numeric, p_reason text)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  sr public.race_station_results%rowtype;
  v_has_tech boolean;
  v_status public.race_event_status;
  v_cat uuid;
  v_old numeric;
  v_snap jsonb;
begin
  select * into sr from public.race_station_results where id = p_result_id for update;
  if not found then raise exception 'RACE_NOT_FOUND: result' using errcode = 'no_data_found'; end if;
  if public.race_is_manager(sr.event_id) is not true then raise exception 'RACE_FORBIDDEN' using errcode = 'insufficient_privilege'; end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'RACE_REASON_REQUIRED: a correction needs a reason' using errcode = 'check_violation'; end if;
  if p_field not in ('official_score', 'technique_score') then raise exception 'RACE_INVALID_FIELD: %', p_field using errcode = 'check_violation'; end if;
  if p_value is null or p_value < 0 then raise exception 'RACE_INVALID_VALUE: a score is zero or more' using errcode = 'check_violation'; end if;
  select status into v_status from public.race_events where id = sr.event_id;
  if v_status = 'ARCHIVED' then raise exception 'RACE_EVENT_ARCHIVED: archived results cannot be corrected' using errcode = 'check_violation'; end if;
  if sr.status not in ('LOCKED', 'CORRECTED') then
    raise exception 'RACE_INVALID_STATE: only a locked result can be corrected (this one is %)', sr.status using errcode = 'check_violation';
  end if;
  select has_technique into v_has_tech from public.race_stations where id = sr.station_id;
  if p_field = 'technique_score' then
    if not v_has_tech then raise exception 'RACE_NO_TECHNIQUE_AT_STATION' using errcode = 'check_violation'; end if;
    if p_value > 10 or p_value <> round(p_value, 1) then raise exception 'RACE_INVALID_VALUE: technique is 0–10 in steps of 0.1' using errcode = 'check_violation'; end if;
  end if;
  v_old := case p_field when 'official_score' then sr.official_score else sr.technique_score end;
  if v_old is not distinct from p_value then raise exception 'RACE_NO_CHANGE: the value is already %', p_value using errcode = 'check_violation'; end if;

  insert into public.race_result_corrections (event_id, station_id, station_result_id, field, old_value, new_value, reason, corrected_by)
  values (sr.event_id, sr.station_id, sr.id, p_field, to_jsonb(v_old), to_jsonb(p_value), btrim(p_reason), auth.uid());
  update public.race_station_results
     set official_score = case when p_field = 'official_score' then p_value else official_score end,
         technique_score = case when p_field = 'technique_score' then p_value else technique_score end,
         status = 'CORRECTED'
   where id = sr.id;
  perform public.race_audit('race.result.correct', sr.event_id, 'race_station_results', sr.id,
    jsonb_build_object(p_field, v_old), jsonb_build_object(p_field, p_value), jsonb_build_object('reason', btrim(p_reason)));

  select category_id into v_cat from public.race_registrations where id = sr.registration_id;
  if v_status = 'RESULTS_OFFICIAL' then
    v_snap := public.race_write_snapshot(sr.event_id, v_cat, true);
  end if;
  return jsonb_build_object('result_id', sr.id, 'field', p_field, 'old', v_old, 'new', p_value, 'status', 'CORRECTED', 'snapshot', v_snap);
end;
$$;
grant execute on function race_correct_station_result(uuid, text, numeric, text) to authenticated;
revoke execute on function race_correct_station_result(uuid, text, numeric, text) from public, anon;

-- ---------------------------------------------------------------------------
-- The public leaderboard: race number + first name and last initial, nothing else. Read-only.
-- OFFICIAL -> the latest official snapshot; LIVE / FINISHED -> PROVISIONAL, computed from the stored results (it never advances the engine).
-- ---------------------------------------------------------------------------
create or replace function race_leaderboard(p_event_id uuid, p_category_code text default null)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  e public.race_events%rowtype;
  v_official boolean;
  v_cats jsonb := '[]'::jsonb;
  c record;
  v_rows jsonb;
  v_version int;
  v_block jsonb;
begin
  select * into e from public.race_events where id = p_event_id;
  if not found or e.status not in ('LIVE', 'FINISHED', 'RESULTS_OFFICIAL', 'ARCHIVED') then
    return jsonb_build_object('available', false);
  end if;
  v_official := e.status in ('RESULTS_OFFICIAL', 'ARCHIVED');
  for c in select id, code, name from public.race_categories
            where event_id = p_event_id and (p_category_code is null or code::text = upper(p_category_code)) order by sort_order loop
    v_version := null;
    if v_official then
      select max(version) into v_version from public.race_rankings where category_id = c.id and is_official;
      select coalesce(jsonb_agg(jsonb_build_object('rank', r.overall_rank, 'race_number', g.race_number, 'name', public.race_display_name(a.full_name),
                'total_points', r.total_points, 'placements', r.station_placements,
                'tb_s04', r.tb_s04_technique, 'tb_s07', r.tb_s07_technique) order by r.overall_rank, g.race_number), '[]'::jsonb)
        into v_rows
        from public.race_rankings r
        join public.race_registrations g on g.id = r.registration_id
        join public.race_athletes a on a.id = g.athlete_id
       where r.category_id = c.id and r.version = v_version;
    else
      select coalesce(jsonb_agg(jsonb_build_object('rank', x.overall_rank, 'race_number', x.race_number, 'name', public.race_display_name(x.full_name),
                'total_points', x.total_points, 'placements', x.placements, 'tb_s04', x.tb_s04, 'tb_s07', x.tb_s07) order by x.overall_rank, x.race_number), '[]'::jsonb)
        into v_rows from public.race_rank_rows(p_event_id, c.id) x;
    end if;
    v_cats := v_cats || jsonb_build_object(
      'code', c.code, 'name', c.name, 'state', case when v_official then 'OFFICIAL' else 'PROVISIONAL' end, 'version', v_version,
      'rows', v_rows,
      'racing', (select count(*) from public.race_registrations g where g.event_id = p_event_id and g.category_id = c.id and g.status = 'CONFIRMED'
                   and g.race_status in ('CHECKED_IN', 'LATE_CHECK_IN', 'STARTED')),
      'excluded', coalesce((select jsonb_agg(jsonb_build_object('race_number', g.race_number, 'name', public.race_display_name(a.full_name),
                   'status', case g.race_status when 'MISSED_START' then 'DNS' else g.race_status::text end) order by g.race_number)
                   from public.race_registrations g join public.race_athletes a on a.id = g.athlete_id
                  where g.event_id = p_event_id and g.category_id = c.id and g.status = 'CONFIRMED' and g.race_status in ('MISSED_START', 'DNF', 'WITHDRAWN')), '[]'::jsonb));
  end loop;
  return jsonb_build_object('available', true, 'server_time', to_jsonb(clock_timestamp()), 'event', jsonb_build_object('name', e.name),
                            'official', v_official, 'categories', v_cats);
end;
$$;
grant execute on function race_leaderboard(uuid, text) to anon, authenticated;
revoke execute on function race_leaderboard(uuid, text) from public;
