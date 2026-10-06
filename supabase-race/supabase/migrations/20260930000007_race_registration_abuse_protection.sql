-- REGISTRATION ABUSE PROTECTION (database-side only; runbook §11, decision L6).
--
-- Scope: the ONE public entry point, race_register_athlete(). Nothing about what registration collects, how race numbers / payment / duplicates work, or any
-- race logic (timing, scoring, results) changes: the function keeps its signature, its result and its grants, and only gains a guard call in front of the
-- unchanged race_register_core().
--
-- What the guard enforces (all inside the same transaction as the registration, so it cannot be bypassed by calling the API directly):
--   * per client IP:   at most per_ip_10min registrations per 10 minutes and per_ip_hour per hour
--   * per event:       at most per_event_minute registrations per minute (a flood brake)
--   * staff are exempt: race_staff_register_athlete() never calls the guard, and an authenticated member of the event's operations staff is skipped too
--   * the IP is NEVER stored: only sha256(salt || ip) is kept; the salt lives in a table no client can read
--
-- What is counted: registrations that COMPLETE. A refused or failed call (rate limit, duplicate person, invalid input) raises and PostgreSQL rolls the whole
-- transaction back, including the guard's bookkeeping — so a retried/duplicate/invalid call never consumes quota, and a refusal does not extend a lock-out.
-- Limits are exact under concurrency: the guard serialises per (event, ip) with transaction-scoped advisory locks (taken in a fixed order: event, then ip).
-- Known limit (documented in the runbook): probing with invalid or duplicate data is not counted (it rolls back); it creates no data.
--
-- The IP comes from the PostgREST request headers (request.headers). Which header and which hop is configurable in the singleton settings row and MUST be
-- confirmed on the real project (runbook §5): default = the LAST entry of x-forwarded-for (the one the platform's own proxy appended; earlier entries can
-- be client-supplied). When no IP can be determined (a direct database session, not a PostgREST request) the per-IP limits are skipped and only the
-- per-event ceiling applies.

-- ---------------------------------------------------------------------------
-- settings (singleton) + per-event overrides + attempts (hashed IP only)
-- ---------------------------------------------------------------------------
create table if not exists race_registration_settings (
  id boolean primary key default true check (id),
  ip_salt text not null default (gen_random_uuid()::text || gen_random_uuid()::text),
  ip_header text not null default 'x-forwarded-for' check (ip_header = lower(ip_header) and length(ip_header) between 1 and 60),
  ip_from_right int not null default 1 check (ip_from_right between 1 and 10),
  per_ip_10min int not null default 8 check (per_ip_10min between 1 and 1000),
  per_ip_hour int not null default 30 check (per_ip_hour between 1 and 5000),
  per_event_minute int not null default 120 check (per_event_minute between 1 and 5000),
  enabled boolean not null default true,
  updated_at timestamptz not null default clock_timestamp()
);
insert into race_registration_settings (id) values (true) on conflict (id) do nothing;

create table if not exists race_registration_limit_overrides (
  event_id uuid primary key references race_events (id) on delete cascade,
  per_ip_10min int check (per_ip_10min between 1 and 1000),
  per_ip_hour int check (per_ip_hour between 1 and 5000),
  per_event_minute int check (per_event_minute between 1 and 5000),
  enabled boolean,
  updated_at timestamptz not null default clock_timestamp(),
  updated_by uuid references race_profiles (id)
);

create table if not exists race_registration_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references race_events (id) on delete cascade,
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),     -- sha256(salt || ip); null = no IP known
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists idx_race_reg_attempts_ip on race_registration_attempts (event_id, ip_hash, created_at);
create index if not exists idx_race_reg_attempts_event on race_registration_attempts (event_id, created_at);

alter table race_registration_settings enable row level security;
alter table race_registration_limit_overrides enable row level security;
alter table race_registration_attempts enable row level security;
revoke all on race_registration_settings, race_registration_limit_overrides, race_registration_attempts from public, anon, authenticated;
-- (no policies: only the SECURITY DEFINER functions below can touch them)

-- ---------------------------------------------------------------------------
-- the caller's IP, from the PostgREST request headers
-- ---------------------------------------------------------------------------
create or replace function race_request_ip()
returns text
language plpgsql stable security definer
set search_path = ''
as $$
declare
  s public.race_registration_settings;
  v_headers jsonb;
  v_val text;
  v_parts text[];
  v_ip text;
begin
  select * into s from public.race_registration_settings where id;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  if v_headers is null then return null; end if;
  select value into v_val from jsonb_each_text(v_headers) where lower(key) = s.ip_header limit 1;
  if v_val is null or btrim(v_val) = '' then return null; end if;
  v_parts := string_to_array(v_val, ',');
  v_ip := btrim(v_parts[greatest(array_length(v_parts, 1) - s.ip_from_right + 1, 1)]);
  if v_ip is null or v_ip = '' or length(v_ip) > 64 then return null; end if;
  return lower(v_ip);
end $$;
revoke execute on function race_request_ip() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- the guard (called first by race_register_athlete)
-- ---------------------------------------------------------------------------
create or replace function race_registration_guard(p_event_id uuid)
returns void
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  s public.race_registration_settings;
  o public.race_registration_limit_overrides;
  v_enabled boolean;
  v_ip text;
  v_hash text;
  v_per_ip_10 int; v_per_ip_h int; v_per_ev int;
  n int;
begin
  if not exists (select 1 from public.race_events where id = p_event_id) then return; end if;     -- the core raises the proper error
  select * into s from public.race_registration_settings where id;
  select * into o from public.race_registration_limit_overrides where event_id = p_event_id;
  v_enabled := coalesce(o.enabled, s.enabled);
  v_per_ip_10 := coalesce(o.per_ip_10min, s.per_ip_10min);
  v_per_ip_h := coalesce(o.per_ip_hour, s.per_ip_hour);
  v_per_ev := coalesce(o.per_event_minute, s.per_event_minute);
  if not v_enabled then return; end if;
  -- the event's own operations staff are never limited (door registration)
  if auth.uid() is not null and public.race_is_ops(p_event_id) then return; end if;

  v_ip := public.race_request_ip();
  v_hash := case when v_ip is null then null else encode(sha256(convert_to(s.ip_salt || ':' || v_ip, 'UTF8')), 'hex') end;

  -- serialise: event first, then ip (fixed order → no deadlock); both are released when the transaction ends
  perform pg_advisory_xact_lock(hashtextextended('race-reg-event:' || p_event_id::text, 0));
  if v_hash is not null then
    perform pg_advisory_xact_lock(hashtextextended('race-reg-ip:' || p_event_id::text || ':' || v_hash, 0));
  end if;

  delete from public.race_registration_attempts where event_id = p_event_id and created_at < clock_timestamp() - interval '2 hours';

  select count(*) into n from public.race_registration_attempts where event_id = p_event_id and created_at >= clock_timestamp() - interval '1 minute';
  if n >= v_per_ev then
    raise exception 'RACE_RATE_LIMITED: too many registrations right now — please try again in a minute' using errcode = 'check_violation';
  end if;
  if v_hash is not null then
    select count(*) into n from public.race_registration_attempts where event_id = p_event_id and ip_hash = v_hash and created_at >= clock_timestamp() - interval '10 minutes';
    if n >= v_per_ip_10 then
      raise exception 'RACE_RATE_LIMITED: too many registrations from this connection — please try again in a few minutes' using errcode = 'check_violation';
    end if;
    select count(*) into n from public.race_registration_attempts where event_id = p_event_id and ip_hash = v_hash and created_at >= clock_timestamp() - interval '1 hour';
    if n >= v_per_ip_h then
      raise exception 'RACE_RATE_LIMITED: too many registrations from this connection — please try again later' using errcode = 'check_violation';
    end if;
  end if;
  insert into public.race_registration_attempts (event_id, ip_hash) values (p_event_id, v_hash);
end $$;
revoke execute on function race_registration_guard(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- the public entry point: same signature, same result, same grants — guard first, then the unchanged core
-- ---------------------------------------------------------------------------
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
  perform public.race_registration_guard(p_event_id);
  return query
    select c.registration_id, c.race_number, c.access_token, c.status, c.amount_due, c.currency
      from public.race_register_core(p_event_id, p_full_name, p_phone, p_email, p_gender, p_date_of_birth,
        p_category, p_pushup_style, p_waiver_accepted, p_emergency_contact,
        array['REGISTRATION_OPEN']::public.race_event_status[], true) c;
end $$;
grant execute on function race_register_athlete(uuid, text, text, text, public.race_gender, date, public.race_category_code,
  public.race_pushup_style, boolean, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- the Event Manager can tune the limits for HIS event (reason mandatory, audited)
-- ---------------------------------------------------------------------------
create or replace function race_set_registration_limits(
  p_event_id uuid, p_per_ip_10min int, p_per_ip_hour int, p_per_event_minute int, p_enabled boolean, p_reason text
)
returns jsonb
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_before public.race_registration_limit_overrides;
  v_after public.race_registration_limit_overrides;
begin
  if auth.uid() is null or not (public.race_is_manager(p_event_id) or public.race_is_super_admin()) then
    raise exception 'RACE_FORBIDDEN: only the Event Manager can change registration limits' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'RACE_REASON_REQUIRED: say why the registration limits are changed' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.race_events where id = p_event_id) then
    raise exception 'RACE_NOT_FOUND: event' using errcode = 'no_data_found';
  end if;
  select * into v_before from public.race_registration_limit_overrides where event_id = p_event_id;
  insert into public.race_registration_limit_overrides (event_id, per_ip_10min, per_ip_hour, per_event_minute, enabled, updated_by)
  values (p_event_id, p_per_ip_10min, p_per_ip_hour, p_per_event_minute, p_enabled, auth.uid())
  on conflict (event_id) do update
    set per_ip_10min = excluded.per_ip_10min, per_ip_hour = excluded.per_ip_hour, per_event_minute = excluded.per_event_minute,
        enabled = excluded.enabled, updated_at = clock_timestamp(), updated_by = excluded.updated_by
  returning * into v_after;
  perform public.race_audit('race.registration.limits', p_event_id, 'race_registration_limit_overrides', p_event_id,
    case when v_before.event_id is null then null else to_jsonb(v_before) - 'updated_by' end, to_jsonb(v_after) - 'updated_by',
    jsonb_build_object('reason', trim(p_reason)));
  return jsonb_build_object('event_id', p_event_id, 'per_ip_10min', v_after.per_ip_10min, 'per_ip_hour', v_after.per_ip_hour,
                            'per_event_minute', v_after.per_event_minute, 'enabled', v_after.enabled);
end $$;
revoke execute on function race_set_registration_limits(uuid, int, int, int, boolean, text) from public, anon;
grant execute on function race_set_registration_limits(uuid, int, int, int, boolean, text) to authenticated;
