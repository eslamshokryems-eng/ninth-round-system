-- PRIVATE DEMO EVENTS ARE NOT PUBLIC (follow-up to 20261001000001).
--
-- Problem found in the audit: every anonymous read path decides "may this caller see event X?" through race_event_visible() (status <> 'DRAFT'), and an
-- event creator could see every event. A demo event leaves DRAFT when its heats are locked, so anyone who knew its slug (or id) could then read it.
--
-- Change (smallest that closes it): a demo event (race_events.is_demo) is visible to ITS OWN staff and Super Admins only — nobody else, whatever its status,
-- whatever the slug. Everything that already goes through race_event_visible() inherits this with no policy rewrite: the RLS policies on race_events,
-- race_categories, race_stations, race_station_rules, race_heats, race_clock, and the functions race_get_public_event, race_event_schedule, race_server_time.
-- The remaining anonymous entry points that did not use it are closed individually below. Non-demo events behave exactly as before.

create or replace function race_event_visible(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when e.is_demo then public.race_is_event_staff(e.id) is true
      else e.status <> 'DRAFT' or public.race_is_event_staff(e.id) is true or public.race_can_create_events() is true
    end
    from public.race_events e where e.id = p_event_id), false);
$$;

-- official results are public only for real events
create or replace function race_results_public(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.race_events e
    where e.id = p_event_id and not e.is_demo and e.status in ('RESULTS_OFFICIAL', 'ARCHIVED')
  );
$$;

-- the public leaderboard: staff-only for a demo
create or replace function public.race_leaderboard(p_event_id uuid, p_category_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not found or e.status not in ('LIVE', 'FINISHED', 'RESULTS_OFFICIAL', 'ARCHIVED')
     or (e.is_demo and public.race_is_event_staff(p_event_id) is not true) then       -- a private demo's standings are staff-only
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
$function$;

-- true when a CLIENT role (anon / authenticated) is asking about a demo event it is not staff of. Internal engine calls (role = owner) are never affected.
create or replace function race_demo_hidden(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(current_setting('role', true), '') in ('anon', 'authenticated')
     and exists (select 1 from public.race_events e where e.id = p_event_id and e.is_demo)
     and public.race_is_event_staff(p_event_id) is not true;
$$;
revoke execute on function race_demo_hidden(uuid) from public, anon, authenticated;

-- id-keyed helpers that anon can execute and that did not check visibility
create or replace function race_now_ms(p_event_id uuid)
returns bigint
language sql security definer
set search_path = ''
as $$
  select public.race_ms_from_clock(c.started_at, c.paused_at, c.paused_total_ms, clock_timestamp())
  from public.race_clock c where c.event_id = p_event_id and not public.race_demo_hidden(p_event_id);
$$;

create or replace function race_event_accepts_judges(p_event_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.race_events e
    where e.id = p_event_id and e.status in ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'HEATS_LOCKED')
      and not public.race_demo_hidden(p_event_id)
  );
$$;

-- public online registration: a demo is never open to the public, not even in the instant its heats are being locked (same signature, result and grants)
create or replace function race_register_athlete(
  p_event_id uuid, p_full_name text, p_phone text, p_email text, p_gender public.race_gender,
  p_date_of_birth date, p_category public.race_category_code, p_pushup_style public.race_pushup_style default null,
  p_waiver_accepted boolean default false, p_emergency_contact jsonb default null
)
returns table (
  registration_id uuid, race_number text, access_token text,
  status public.race_reg_status, amount_due numeric, currency text
)
language plpgsql volatile security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.race_events e where e.id = p_event_id and e.is_demo) then
    raise exception 'RACE_REGISTRATION_CLOSED: registration is not open for this event' using errcode = 'check_violation';
  end if;
  perform public.race_registration_guard(p_event_id);
  return query
    select c.registration_id, c.race_number, c.access_token, c.status, c.amount_due, c.currency
      from public.race_register_core(p_event_id, p_full_name, p_phone, p_email, p_gender, p_date_of_birth,
        p_category, p_pushup_style, p_waiver_accepted, p_emergency_contact,
        array['REGISTRATION_OPEN']::public.race_event_status[], true) c;
end $$;
