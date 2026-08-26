-- 9th Round — Location-based Check-In (HR Attendance).
--
-- An employee's Clock In now requires their device GPS to be within the
-- branch's configured radius — real enforcement happens here, server-side,
-- not just in the browser (a client could otherwise send any coordinates
-- it likes). Clock Out is unaffected — the requirement is specifically on
-- the "did you actually show up" moment, not on leaving.
--
-- Backward-compatible until an admin configures a branch's coordinates: a
-- branch with no latitude/longitude set skips the distance check entirely
-- (clock_in_at_location() below), so this ships without locking anyone out
-- the moment it's deployed.

alter table branches add column latitude numeric(9, 6);
alter table branches add column longitude numeric(9, 6);
alter table branches add column check_in_radius_meters integer not null default 75 check (check_in_radius_meters between 10 and 2000);

alter table attendance_records add column clock_in_latitude numeric(9, 6);
alter table attendance_records add column clock_in_longitude numeric(9, 6);

-- ---------------------------------------------------------------------------
-- set_branch_location() — super_admin, or the branch_manager of that exact
-- branch. A narrow, single-purpose function rather than a new RLS UPDATE
-- policy on `branches` (which also holds name/address/phone) — a manager
-- gets exactly this one capability, nothing broader.
-- ---------------------------------------------------------------------------

create or replace function set_branch_location(
  p_branch_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_radius_meters integer default 75
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (
    public.is_super_admin()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'branch_manager' and p.branch_id = p_branch_id and p.is_active
    )
  ) then
    raise exception 'Not authorized to set this branch''s location.';
  end if;

  if p_radius_meters < 10 or p_radius_meters > 2000 then
    raise exception 'Check-in radius must be between 10 and 2000 meters.';
  end if;

  update public.branches
  set latitude = p_latitude, longitude = p_longitude, check_in_radius_meters = p_radius_meters
  where id = p_branch_id;

  perform public.log_audit_event(
    'update_branch_location', 'branch', p_branch_id, null,
    jsonb_build_object('latitude', p_latitude, 'longitude', p_longitude, 'radius_meters', p_radius_meters),
    '{}'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- clock_in_at_location() — security invoker: the insert still goes through
-- the existing "staff clock self in" RLS policy exactly as a plain insert
-- would, so this grants no privilege the caller didn't already have. It
-- never raises for an out-of-range attempt — it returns
-- is_within_range = false (with the computed distance) so the app layer
-- can show a precise, friendly message instead of parsing an error string.
-- ---------------------------------------------------------------------------

create or replace function clock_in_at_location(
  p_branch_id uuid,
  p_latitude numeric,
  p_longitude numeric
)
returns table (
  id uuid,
  profile_id uuid,
  branch_id uuid,
  clock_in timestamptz,
  clock_out timestamptz,
  is_within_range boolean,
  distance_meters numeric
)
language plpgsql
security invoker
as $$
declare
  v_branch_lat numeric;
  v_branch_lng numeric;
  v_radius int;
  v_distance numeric;
  v_within boolean := true;
begin
  select latitude, longitude, check_in_radius_meters into v_branch_lat, v_branch_lng, v_radius
  from branches where branches.id = p_branch_id;

  -- Haversine great-circle distance in meters. Only evaluated once the
  -- branch actually has coordinates configured.
  if v_branch_lat is not null and v_branch_lng is not null then
    v_distance := 6371000 * acos(
      least(1, greatest(-1,
        cos(radians(v_branch_lat)) * cos(radians(p_latitude)) * cos(radians(p_longitude) - radians(v_branch_lng))
        + sin(radians(v_branch_lat)) * sin(radians(p_latitude))
      ))
    );
    v_within := v_distance <= v_radius;
  end if;

  if not v_within then
    return query select null::uuid, null::uuid, null::uuid, null::timestamptz, null::timestamptz, false, v_distance;
    return;
  end if;

  return query
    insert into attendance_records (profile_id, branch_id, clock_in_latitude, clock_in_longitude)
    values (auth.uid(), p_branch_id, p_latitude, p_longitude)
    returning attendance_records.id, attendance_records.profile_id, attendance_records.branch_id,
              attendance_records.clock_in, attendance_records.clock_out, true, v_distance;
end;
$$;
